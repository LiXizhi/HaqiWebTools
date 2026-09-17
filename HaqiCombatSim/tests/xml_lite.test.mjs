// 导出器用的轻量 XML 解析器测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXml, firstChild, childrenNamed, findAll, numberish, decodeEntities } from '../scripts/lib/xml_lite.mjs';

test('parseXml：声明、注释、CDATA、自闭合、属性实体、嵌套', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- comment -->
<cards>
  <card datafile="config/Aries/Cards/Teen/Pass.xml"/>
  <card key="Fire_SingleAttack_Level1" name="A &amp; B" cost="2">
    <params damage="120" school="fire"><![CDATA[ignored]]></params>
    <params damage="150"/>
  </card>
</cards>`;
    const root = parseXml(xml);
    const cards = firstChild(root, 'cards');
    assert.ok(cards);
    const list = childrenNamed(cards, 'card');
    assert.equal(list.length, 2);
    assert.equal(list[0].attr.datafile, 'config/Aries/Cards/Teen/Pass.xml');
    assert.equal(list[1].attr.name, 'A & B');
    assert.equal(childrenNamed(list[1], 'params').length, 2);
    assert.equal(findAll(root, 'params').length, 2);
    assert.equal(findAll(root, 'params')[0].attr.damage, '120');
});

test('numberish 与 decodeEntities', () => {
    assert.equal(numberish('12'), 12);
    assert.equal(numberish('1.5'), 1.5);
    assert.equal(numberish('-3'), -3);
    assert.equal(numberish('abc'), 'abc');
    assert.equal(numberish(''), '');
    assert.equal(decodeEntities('&lt;a&gt; &quot;x&quot; &#65;'), '<a> "x" A');
});

test('parseXml：CRLF 与 Windows 风格文件', () => {
    const root = parseXml('<a>\r\n  <b x="1"/>\r\n  <b x="2"/>\r\n</a>\r\n');
    assert.equal(childrenNamed(firstChild(root, 'a'), 'b').length, 2);
});
