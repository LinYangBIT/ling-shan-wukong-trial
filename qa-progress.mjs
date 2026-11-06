import assert from 'node:assert/strict';
import test from 'node:test';
import {CHECKPOINT_KEY, validateCheckpoint, readCheckpoint, writeCheckpoint, removeCheckpoint} from './dist/progress.js';

const checkpoint={version:1,stage:'spirit',time:132.5,difficulty:'hard',practice:false,hits:24,damage:72};
function storage(value=null){const data=new Map(value===null?[]:[[CHECKPOINT_KEY,value]]);return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}

test('chapter bookmark round-trips only supported fields',()=>{
 const host=storage();assert.equal(writeCheckpoint(host,{...checkpoint,unrelated:'not saved'}),true);
 assert.deepEqual(readCheckpoint(host),checkpoint);assert(!host.getItem(CHECKPOINT_KEY).includes('unrelated'));
 assert.equal(removeCheckpoint(host),true);assert.equal(readCheckpoint(host),null);
});
test('malformed, missing and incompatible bookmarks safely fall back to no continue',()=>{
 for(const value of [null,'{','undefined','null','[]','42',JSON.stringify({...checkpoint,version:2}),JSON.stringify({...checkpoint,stage:'missing'})])assert.equal(readCheckpoint(storage(value)),null);
});
test('invalid core fields cannot replace an existing valid checkpoint',()=>{
 const host=storage(JSON.stringify(checkpoint));
 for(const patch of [{time:-1},{time:Infinity},{time:604801},{time:'3'},{difficulty:'easy'},{practice:1},{version:'1'},{stage:'menu'}]){
  assert.equal(writeCheckpoint(host,{...checkpoint,...patch}),false);assert.deepEqual(readCheckpoint(host),checkpoint);
 }
});
test('optional damaged counters reset without losing a valid chapter',()=>{
 assert.deepEqual(validateCheckpoint({...checkpoint,hits:-1,damage:NaN}),{...checkpoint,hits:0,damage:0});
 assert.deepEqual(validateCheckpoint({...checkpoint,hits:1.5,damage:-3}),{...checkpoint,hits:0,damage:0});
});
test('blocked storage never prevents gameplay or throws during save/load/remove',()=>{
 const host={getItem(){throw Error('blocked');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked');}};
 assert.equal(readCheckpoint(host),null);assert.equal(writeCheckpoint(host,checkpoint),false);assert.equal(removeCheckpoint(host),false);
 assert.equal(readCheckpoint(undefined),null);assert.equal(writeCheckpoint(undefined,checkpoint),false);
});
