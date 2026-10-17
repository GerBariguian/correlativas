'use strict'
// Explicit transport controls; no operation queue and no automatic retry.
const {disableNetwork,enableNetwork}=require('firebase/firestore')
const disconnect=client=>disableNetwork(client.db)
const reconnect=client=>enableNetwork(client.db)
async function loseResponse(operation){await operation();throw Object.assign(Error('LAB_RESPONSE_LOST_AFTER_COMPLETION'),{code:'LAB_RESULT_UNCERTAIN'})}
module.exports={disconnect,reconnect,loseResponse}
