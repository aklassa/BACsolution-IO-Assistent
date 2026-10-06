import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isReservePoint, reservePointKeys, nextInspectionPointKey} from '../Shared/point-filter.js';

const sample = (key, name, other = {}) => ({key,name,description:'',terminal:key,hwType:'in_ana',...other});
const points = [
  sample('AI1','RES01'), sample('AI2','Zulufttemperatur Anlage 2.1'),
  sample('AO1','Reserve Ausgang 1',{hwType:'out_ana'}),
  sample('DO1','FG Reservepumpe',{hwType:'out_bin'}),
  sample('DI1','BM Ventilator',{description:'Nicht belegt'}),
  sample('AI3','Außentemperatur'), sample('DO2','Spare 2',{hwType:'out_bin'})
];

test('explicit reserve labels in names and descriptions cover inputs, outputs and AKS separators', () => {
  for (const name of ['Reserve','reserve 1','RES.','RES01','Spare 2','Unused','unbelegt','unbenutzt',
    'Nicht belegt','NICHT_VERWENDET','nicht-benutzt','not used','Anlage_2.1_RES_01','AI3 - Reserve']) {
    assert.equal(isReservePoint(sample('test',name)),true,name);
    assert.equal(isReservePoint(sample('test','Eingang',{description:name})),true,name);
  }
  assert.deepEqual(reservePointKeys(points),['AI1','AO1','DI1','DO2']);
});

test('active equipment, negated labels, zero readings, offline and untested points stay visible', () => {
  for (const name of ['Reservepumpe','Druckreserve','Freigabe','Frei Kühlung','Presostat','Raumtemp.',
    'Resetsignal','reserved','keine Reserve','nicht Reserve','not unused','no spare','BM_RESERVEVENTIL']) {
    assert.equal(isReservePoint(sample('test',name)),false,name);
  }
  assert.equal(isReservePoint(sample('test','Zulufttemperatur',{value:{text:'0',unit:'°C'},testState:0,online:false,testComment:'Reserve',path:'Reserve/AI1',deviceName:'Reserve'})),false);
  assert.equal(isReservePoint(null),false);
});

test('next and previous skip reserve inputs and outputs while preserving controller order', () => {
  const next = extra => nextInspectionPointKey({points,hideReserve:true,...extra});
  assert.equal(next({}),'AI2');
  assert.equal(next({currentKey:'AI2'}),'DO1');
  assert.equal(next({currentKey:'DO1'}),'AI3');
  assert.equal(next({currentKey:'AI3'}),'');
  assert.equal(next({direction:-1}),'AI3');
  assert.equal(next({currentKey:'AI3',direction:-1}),'DO1');
  assert.equal(next({currentKey:'DO1',direction:-1}),'AI2');
  assert.equal(next({currentKey:'AI2',direction:-1}),'');
  assert.equal(next({currentKey:'AI2',hideReserve:false}),'AO1');
});

test('hiding the selected reserve point resumes from its original position without mutating records', () => {
  const unchanged = JSON.stringify(points);
  assert.equal(nextInspectionPointKey({points,currentKey:'AO1',hideReserve:true}),'DO1');
  assert.equal(nextInspectionPointKey({points,currentKey:'AO1',hideReserve:true,direction:-1}),'AI2');
  assert.equal(JSON.stringify(points),unchanged);
  assert.equal(nextInspectionPointKey({points:points.filter(isReservePoint),hideReserve:true}),'');
  assert.throws(() => nextInspectionPointKey({points,currentKey:'missing',hideReserve:true}),/nicht mehr vorhanden/);
});

test('guided next uses both the search matches and reserve filter without a fallback to another point', () => {
  assert.equal(nextInspectionPointKey({points,currentKey:'AI2',hideReserve:true,matchingKeys:['AO1','AI3']}),'AI3');
  assert.equal(nextInspectionPointKey({points,currentKey:'AI2',hideReserve:true,matchingKeys:['AO1']}),'');
  assert.equal(nextInspectionPointKey({points,matchingKeys:[]}),'');
  assert.throws(() => nextInspectionPointKey({points,direction:0}),/ungültig/);
});

test('native bundle exposes the same filter and navigation for list and speech search', () => {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('../Resources/LanguageCore.js',import.meta.url),'utf8'),context);
  const call = (operation, args) => {
    const result=JSON.parse(context.mobileCall(JSON.stringify({operation,...args})));
    assert.equal(result.ok,true,result.error);
    return result.value;
  };
  const hidden = new Set(call('reservePointKeys',{points}));
  const visible = points.filter(p => !hidden.has(p.key));
  assert.deepEqual(visible.map(p => p.key),['AI2','DO1','AI3']);
  assert.equal(call('search',{points:visible,text:'Zulufttemperatur Anlage 2.1'}).matches[0].key,'AI2');
  assert.equal(call('nextInspectionPointKey',{points,currentKey:'AI2',hideReserve:true,matchingKeys:['AI3','AO1']}),'AI3');
});
