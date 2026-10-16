import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'pending_key_store.dart';

/// Browser sessionStorage survives reload in the same tab, not cross-device.
/// Fail closed when storage access is denied; no token or prompt is persisted.
class SessionPendingKeyStore implements PendingKeyStore {
  static const prefix='omniagent:r08:pending:v1:';
  @override
  String? read(String ownerId) =>
      web.window.sessionStorage.getItem((prefix+ownerId).toJS)?.toDart;
  @override
  void write(String ownerId,String serialized){
    web.window.sessionStorage.setItem((prefix+ownerId).toJS,serialized.toJS);
  }
  @override
  void clear(String ownerId){
    web.window.sessionStorage.removeItem((prefix+ownerId).toJS);
  }
}

PendingKeyStore createPendingKeyStore()=>SessionPendingKeyStore();
