// xml_lite.mjs — 零依赖的极简 XML 解析器（够用于 config/Aries 的属性型 XML）。
// 支持：声明、注释、CDATA（忽略）、自闭合、嵌套、属性（单/双引号、= 两侧空格）、基本实体。
// 返回节点：{ name, attr: {}, children: [], text }

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e) => {
        if (e[0] === '#') {
            const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isNaN(code) ? m : String.fromCodePoint(code);
        }
        return ENTITIES[e] ?? m;
    });
}

function parseAttrs(s) {
    const attr = {};
    const re = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) attr[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
    return attr;
}

/**
 * @param xml 文本
 * @return 根节点（虚拟 document，children 为顶层元素）
 */
export function parseXml(xml) {
    const root = { name: '#document', attr: {}, children: [], text: '' };
    const stack = [root];
    let i = 0;
    const n = xml.length;
    while (i < n) {
        const lt = xml.indexOf('<', i);
        if (lt < 0) {
            stack[stack.length - 1].text += xml.slice(i);
            break;
        }
        if (lt > i) stack[stack.length - 1].text += xml.slice(i, lt);
        if (xml.startsWith('<!--', lt)) {
            const end = xml.indexOf('-->', lt + 4);
            i = end < 0 ? n : end + 3;
            continue;
        }
        if (xml.startsWith('<![CDATA[', lt)) {
            const end = xml.indexOf(']]>', lt + 9);
            stack[stack.length - 1].text += xml.slice(lt + 9, end < 0 ? n : end);
            i = end < 0 ? n : end + 3;
            continue;
        }
        if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
            const end = xml.indexOf('>', lt);
            i = end < 0 ? n : end + 1;
            continue;
        }
        // 找到标签结束（考虑引号内的 >）
        let j = lt + 1;
        let quote = null;
        while (j < n) {
            const c = xml[j];
            if (quote) { if (c === quote) quote = null; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
            j++;
        }
        const raw = xml.slice(lt + 1, j);
        i = j + 1;
        if (raw.startsWith('/')) {
            const name = raw.slice(1).trim();
            for (let k = stack.length - 1; k > 0; k--) {
                if (stack[k].name === name) { stack.length = k; break; }
            }
            continue;
        }
        const selfClose = raw.endsWith('/');
        const body = selfClose ? raw.slice(0, -1) : raw;
        const nm = /^\s*([^\s\/>]+)/.exec(body);
        if (!nm) continue;
        const node = { name: nm[1], attr: parseAttrs(body.slice(nm[0].length)), children: [], text: '' };
        stack[stack.length - 1].children.push(node);
        if (!selfClose) stack.push(node);
    }
    return root;
}

export function firstChild(node, name) {
    return node ? node.children.find(c => c.name === name) : undefined;
}

export function childrenNamed(node, name) {
    return node ? node.children.filter(c => c.name === name) : [];
}

/** 深度优先找所有名为 name 的节点 */
export function findAll(node, name, out = []) {
    for (const c of node.children) {
        if (c.name === name) out.push(c);
        findAll(c, name, out);
    }
    return out;
}

/** 属性值转数字（保留非数字字符串，如 "600p"、"true"） */
export function numberish(v) {
    if (v === undefined || v === null) return v;
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (t === '') return t;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    return t;
}
