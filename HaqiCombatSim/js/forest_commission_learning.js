// A saved receipt survives a reload or failed IndexedDB write. The shared
// vocabulary adapter owns eligibility, canonical words and receipt deduplication.
export async function flushForestCommissionPractice(save,{record,valid,persist}){
 const event=save.forestCommission?.practice;
 if(!event||!valid())return false;
 const result=await record({...event,language:'en',words:['boots'],input:'read',source:'forest-commission'},valid);
 if(!result?.persisted||!valid()||save.forestCommission?.practice!==event)return false;
 delete save.forestCommission.practice;
 try{
  if(!persist()){save.forestCommission.practice=event;return false;}
 }catch(error){save.forestCommission.practice=event;throw error;}
 return true;
}
