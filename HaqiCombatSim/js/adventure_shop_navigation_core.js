// Explicit entry points reset stale catalog filters; reopening retains browsing state.
export function shopNavigationState(current={},options={}){
 if(!options.category&&!options.productId&&!options.mode)return {...current};
 const category=options.category||current.category;
 return {...current,category,subcategory:options.subcategory??0,subcategoryCategory:category,
  page:0,query:'',ownership:'',level:'usable',school:'',slot:'',
  selected:options.productId||null,productId:options.productId||null,
  mode:options.mode||'catalog',showAll:options.mode!=='focused'};
}

export function equipmentNavigationState(options={},save={},content={}){
 const state={tab:'gear',slot:0,page:0,query:'',item:null,guid:null,requestedItem:null};
 const item=content.items?.[options.itemId];
 if(!item||!(save.inventory?.[item.id]>0)||(item.kind!==1&&item.slot!==24))return state;
 return {...state,slot:item.slot,item:item.id,requestedItem:item.id};
}

// Consume before opening: later renders must never reopen the same detail.
export function consumeEquipmentRequest(state,items,pageSize){
 const requested=state.requestedItem;state.requestedItem=null;
 if(requested==null)return null;
 const index=items.findIndex(item=>item.id===requested);
 if(index<0){state.item=null;state.guid=null;state.page=0;return null;}
 state.item=requested;state.guid=null;state.page=Math.floor(index/pageSize);
 return items[index];
}
