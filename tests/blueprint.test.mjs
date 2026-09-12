import test from 'node:test';
import assert from 'node:assert/strict';
import {coverage,newBlueprint} from '../lib/blueprint.mjs';
const plan={...newBlueprint(),cells:[{row:'1',column:'diagnosis',target:2}]};
const one={specialty_id:1,physician_task:'diagnosis'};
test('coverage distinguishes missing, complete, excess, and out-of-plan items',()=>{
 assert.equal(coverage(plan,[one]).complete,false);
 assert.equal(coverage(plan,[one,one]).complete,true);
 assert.equal(coverage(plan,[one,one,one]).complete,false);
 assert.equal(coverage(plan,[one,one,{...one,specialty_id:2}]).unmatched,1);
});
test('empty, duplicate and fractional plans cannot be ready',()=>{
 assert.equal(coverage(newBlueprint(),[]).valid,false);
 assert.equal(coverage({...plan,cells:[...plan.cells,...plan.cells]},[]).valid,false);
 assert.equal(coverage({...plan,cells:[{...plan.cells[0],target:1.5}]},[]).valid,false);
});
test('changing taxonomy axes recomputes coverage without changing selected items',()=>{
 const selected=[one];const changed={...plan,rowField:'nl_domain_code'};
 assert.equal(coverage(changed,selected).unmatched,1);assert.deepEqual(selected,[one]);
});
