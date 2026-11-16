// One confirmation may await account authorization and persistence. Keep its
// pending state independent of save identity: successful persistence replaces it.
export function createShopPurchase({purchase,onSuccess,onPending,onError=()=>{}}){
 let pending=false;
 return async function confirmPurchase(){
  if(pending)return false;
  pending=true;onPending(true);
  try{
   const success=await purchase();
   if(success!==true)return false;
   onSuccess();return true;
  }catch(error){onError(error);return false;}
  finally{pending=false;onPending(false);}
 };
}
