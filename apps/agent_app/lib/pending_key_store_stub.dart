import 'pending_key_store.dart';

/// Non-web fallback intentionally makes no claim of durable reload support.
class VolatilePendingKeyStore implements PendingKeyStore {
  final Map<String,String> values={};
  @override
  String? read(String ownerId)=>values[ownerId];
  @override
  void write(String ownerId,String serialized){values[ownerId]=serialized;}
  @override
  void clear(String ownerId){values.remove(ownerId);}
}
PendingKeyStore createPendingKeyStore()=>VolatilePendingKeyStore();
