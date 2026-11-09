/*
 * FinWin rendering engine.
 * Runs the design's template syntax ({{holes}}, <sc-for>, <sc-if>, onClick/onChange)
 * as a normal web page. Templates are parsed by a small parser (not the browser's
 * HTML parser, which would move <sc-for> out of <select>, <table> and <tbody>),
 * rendered to real DOM, then patched into the page with morphdom.
 */
(function (global) {
  'use strict';

  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  var BOOL_ATTR = { disabled: 1, hidden: 1, checked: 1, selected: 1, required: 1, readonly: 1, open: 1 };

  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      var k = e.toLowerCase();
      return ENT[k] !== undefined ? ENT[k] : m;
    });
  }
  function isWs(c) { return c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f'; }

  /* ---------- parser: template string -> tree ---------- */
  function parse(src) {
    var root = { tag: '#root', attrs: [], children: [] }, stack = [root], i = 0, n = src.length;
    function top() { return stack[stack.length - 1]; }
    while (i < n) {
      if (src.startsWith('<!--', i)) { var ce = src.indexOf('-->', i); i = ce < 0 ? n : ce + 3; continue; }
      if (src[i] === '<' && src[i + 1] === '/') {
        var ee = src.indexOf('>', i), name = src.slice(i + 2, ee).trim().toLowerCase();
        for (var k = stack.length - 1; k > 0; k--) { if (stack[k].tag.toLowerCase() === name) { stack.length = k; break; } }
        i = ee + 1; continue;
      }
      var m = src[i] === '<' ? /^<([a-zA-Z][\w:-]*)/.exec(src.slice(i, i + 80)) : null;
      if (m) {
        var tag = m[1], attrs = [], selfClose = false;
        i += m[0].length;
        while (i < n) {
          while (isWs(src[i])) i++;
          if (src[i] === '>') { i++; break; }
          if (src[i] === '/' && src[i + 1] === '>') { i += 2; selfClose = true; break; }
          var j = i;
          while (j < n && !isWs(src[j]) && src[j] !== '=' && src[j] !== '>' && !(src[j] === '/' && src[j + 1] === '>')) j++;
          var an = src.slice(i, j), av = null;
          i = j;
          while (isWs(src[i])) i++;
          if (src[i] === '=') {
            i++;
            while (isWs(src[i])) i++;
            var q = src[i];
            if (q === '"' || q === "'") { var qe = src.indexOf(q, i + 1); av = src.slice(i + 1, qe); i = qe + 1; }
            else { var j2 = i; while (j2 < n && !isWs(src[j2]) && src[j2] !== '>') j2++; av = src.slice(i, j2); i = j2; }
          }
          if (an) attrs.push([an, av === null ? '' : decode(av)]);
        }
        var node = { tag: tag, attrs: attrs, children: [] };
        top().children.push(node);
        if (!selfClose && !VOID[tag.toLowerCase()]) stack.push(node);
        continue;
      }
      var te = src.indexOf('<', i + 1);
      if (te < 0) te = n;
      top().children.push({ text: decode(src.slice(i, te)) });
      i = te;
    }
    return root;
  }

  /* ---------- scope lookups ---------- */
  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
    var parts = expr.split('.'), v = scope[parts[0]];
    for (var i = 1; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) { var v = lookup(e, scope); return v == null || v === false ? '' : String(v); });
  }
  function eventFor(el, lname) {
    if (lname === 'onclick') return 'click';
    if (lname === 'onchange') {
      var t = el.tagName;
      if (t === 'TEXTAREA') return 'input';
      if (t === 'INPUT') { var ty = (el.getAttribute('type') || 'text').toLowerCase(); return ty === 'checkbox' || ty === 'radio' || ty === 'file' ? 'change' : 'input'; }
      return 'change';
    }
    return lname.slice(2);
  }

  /* ---------- render tree -> DOM ---------- */
  function renderNodes(nodes, scope, inSvg, out) {
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, inSvg, out);
    return out;
  }
  function attrOf(node, name) { for (var i = 0; i < node.attrs.length; i++) if (node.attrs[i][0] === name) return node.attrs[i][1]; return null; }

  function renderNode(node, scope, inSvg, out) {
    if (node.text !== undefined) {
      var t = node.text.indexOf('{{') >= 0 ? interp(node.text, scope) : node.text;
      out.push(document.createTextNode(t));
      return;
    }
    var tag = node.tag, lt = tag.toLowerCase();
    if (lt === 'sc-for') {
      var listExpr = (attrOf(node, 'list') || '').match(WHOLE), as = attrOf(node, 'as') || 'item';
      var list = listExpr ? lookup(listExpr[1], scope) : null;
      if (Array.isArray(list)) {
        for (var k = 0; k < list.length; k++) { var cs = Object.create(scope); cs[as] = list[k]; renderNodes(node.children, cs, inSvg, out); }
      }
      return;
    }
    if (lt === 'sc-if') {
      var ve = (attrOf(node, 'value') || '').match(WHOLE);
      if (ve && lookup(ve[1], scope)) renderNodes(node.children, scope, inSvg, out);
      return;
    }
    var svg = inSvg || lt === 'svg';
    var el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    var handlers = null, selVal;
    // set non-event attributes first so eventFor() can read type=
    for (var a = 0; a < node.attrs.length; a++) {
      var name = node.attrs[a][0], raw = node.attrs[a][1], ln = name.toLowerCase();
      if (ln.indexOf('hint-') === 0 || (ln.indexOf('on') === 0 && ln.length > 2)) continue;
      var whole = raw.match(WHOLE), val;
      if (whole) {
        var v = lookup(whole[1], scope);
        if (v == null) continue;
        if (v === false) { if (ln.indexOf('aria-') === 0) val = 'false'; else continue; }
        else if (v === true) val = ln.indexOf('aria-') === 0 ? 'true' : (BOOL_ATTR[ln] ? '' : 'true');
        else val = String(v);
      } else val = raw.indexOf('{{') >= 0 ? interp(raw, scope) : raw;
      if (lt === 'select' && ln === 'value') { selVal = val; continue; }
      el.setAttribute(name, val);
    }
    for (var b = 0; b < node.attrs.length; b++) {
      var hn = node.attrs[b][0].toLowerCase();
      if (hn.indexOf('on') !== 0 || hn.length <= 2) continue;
      var he = node.attrs[b][1].match(WHOLE), fn = he ? lookup(he[1], scope) : null;
      if (typeof fn === 'function') { handlers = handlers || {}; handlers[eventFor(el, hn)] = fn; }
    }
    if (handlers) el.__h = handlers;
    var kids = renderNodes(node.children, scope, svg && lt !== 'foreignobject', []);
    for (var c = 0; c < kids.length; c++) el.appendChild(kids[c]);
    if (selVal !== undefined) {
      var opts = el.querySelectorAll('option');
      for (var o = 0; o < opts.length; o++) { if (opts[o].getAttribute('value') === selVal) opts[o].setAttribute('selected', ''); }
    }
    out.push(el);
  }

  /* ---------- component base class ---------- */
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (u, cb) {
    var host = this.__host;
    if (!host) { this.state = Object.assign({}, this.state, typeof u === 'function' ? u(this.state) : u); return; }
    host.queue.push(u);
    if (cb) host.cbs.push(cb);
    host.schedule();
  };

  function mount(Comp, el, templateSrc, props) {
    var tree = parse(templateSrc);
    var comp = new Comp(props || {});
    var host = { queue: [], cbs: [], pending: false };
    comp.__host = host;
    function flush() {
      host.pending = false;
      var s = comp.state, prev = s;
      while (host.queue.length) { var u = host.queue.shift(); s = Object.assign({}, s, typeof u === 'function' ? u(s) : u); }
      comp.state = s;
      render();
      var cbs = host.cbs.splice(0);
      cbs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
      if (comp.componentDidUpdate) comp.componentDidUpdate(prev);
    }
    host.schedule = function () { if (!host.pending) { host.pending = true; Promise.resolve().then(flush); } };
    host.flushNow = function () { if (host.pending || host.queue.length) flush(); };
    function render() {
      var vals;
      try { vals = comp.renderVals(); } catch (e) { console.error('renderVals failed', e); return; }
      var scope = Object.create(null);
      Object.keys(vals).forEach(function (k) { scope[k] = vals[k]; });
      var next = document.createElement('div');
      var nodes = renderNodes(tree.children, scope, false, []);
      for (var i = 0; i < nodes.length; i++) next.appendChild(nodes[i]);
      global.morphdom(el, next, {
        childrenOnly: true,
        onBeforeElUpdated: function (from, to) { from.__h = to.__h; return true; }
      });
    }
    function delegate(type, bubble) {
      el.addEventListener(type, function (e) {
        var t = e.target;
        while (t && t !== el) {
          if (t.__h && t.__h[type]) { if (t.disabled) return; t.__h[type](e); return; }
          if (!bubble) return;
          t = t.parentNode;
        }
      });
    }
    delegate('click', true);
    delegate('input', false);
    delegate('change', false);
    render();
    if (comp.componentDidMount) comp.componentDidMount();
    return comp;
  }

  global.FinWinEngine = { DCLogic: DCLogic, mount: mount, parse: parse };
})(window);
