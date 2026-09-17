// Executes verbatim functions extracted from original Lua, not a second JS implementation.
import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import fengari from 'fengari';import {damageExpression,healExpression,baseHP,costPips} from '../../js/rules/formulas.js';
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
const root=new URL('../../../../',import.meta.url);
const card=fs.readFileSync(new URL('script/apps/Aries/Combat/ServerObject/card_server.lua',root),'utf8');
const player=fs.readFileSync(new URL('script/apps/Aries/Combat/ServerObject/player_server.lua',root),'utf8');
function slice(s,a,b){return s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));}
const source=slice(card,'local function above_min_boost','local function GetCriticalStrikeDamageRatio')+slice(card,'local function damage_expression','-- process heal penalty')+slice(player,'function Player:GetUpdatedMaxHP()','-- get current pips count')+slice(player,'function Player:CostPips(','-- reset pips');
function evaluate(body){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const rc=lauxlib.luaL_dostring(L,to_luastring(`local Player={} local math_ceil=math.ceil local MAX_SPELL_PENETRATION=70 local vip_bonus_hp={5,5,5,6,6,6,7,7,7,8,10} local vip=-1 local PowerItemManager={IsVIP=function() return vip>=0 end,GetMagicStarLevel=function() return vip end} local System={options={version='kids'}} ${source} ${body}`));if(rc!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tostring(L,-1)));const results=[];for(let i=1;i<=lua.lua_gettop(L);i++)results.push(lua.lua_tonumber(L,i));lua.lua_close(L);return results;}
test('Lua damage and healing expressions: both versions and rounding boundaries',()=>{
 for(const v of ['kids','teen'])for(const base of [0,1,3,103,997])for(const boost of [[],[30,30,-25],[-99],[-100],[-33,17,25]]){
  const args=`{${boost.join(',')},damage_percent=37,resist_percent=-43,spell_penetration=85,spell_penetration_receive=4}`;
  // A leading comma is invalid when boost list is empty.
  const buff=args.replace('{,','{');
  const [d,h]=evaluate(`System.options.version='${v}';return damage_expression(${base},-70,${buff}),heal_expression(${base},{${boost.join(',')}})`);
  assert.equal(damageExpression(v,base,-70,boost,37,-43,85,4),d);assert.ok(Math.abs(healExpression(v,base,boost)-h)<1e-9);
 }
});
test('Lua max HP across schools, versions, levels and VIP',()=>{
 for(const v of ['kids','teen'])for(const school of ['ice','fire','storm','death','life'])for(const level of [1,17,50,80])for(const vip of [-1,0,10]){
  const [hp]=evaluate(`System.options.version='${v}';vip=${vip};local p=setmetatable({},{__index=Player});function p:GetPhase()return '${school}'end;function p:GetLevel()return ${level} end;function p:GetID()return 1 end;function p:GetNID()return 1 end;function p:GetStatsSum(ids)if ids[1]==242 then return 13 else return 97 end end;return p:GetUpdatedMaxHP()`);
  assert.equal(baseHP(v,school,level,13,97,vip),hp);
 }
});
test('Lua energy spending for legal own-school and off-school actions',()=>{
 for(const v of ['kids','teen'])for(const school of ['ice','fire','balance'])for(const normal of [0,1,4,7])for(const power of v==='kids'?[0,1,3]:[0]){
  const available=v==='teen'&&school==='fire'?normal/2:normal+power*(school==='ice'?2:1);
  for(let cost=0;cost<=Math.floor(available);cost++){
   const [real,n,p]=evaluate(`System.options.version='${v}';local p=setmetatable({pips_normal=${normal},pips_power=${power}},{__index=Player});function p:GetPhase()return 'ice'end;local real=p:CostPips(${cost},'${school}');return real,p.pips_normal,p.pips_power`);
   const u={school:'ice',pips:normal,powerPips:power};assert.equal(costPips(u,cost,school,v),real);assert.equal(u.pips,n);assert.equal(u.powerPips,p);
  }
 }
});
