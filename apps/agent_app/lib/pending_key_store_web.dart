// ignore_for_file: avoid_web_libraries_in_flutter
import 'dart:html' as html;

import 'pending_key_store.dart';

/// Browser sessionStorage survives reload in this tab, not cross-device.
class SessionPendingKeyStore implements PendingKeyStore {
  static const prefix='omniagent:r08:pending:v1:';
  @override
  String? read(String ownerId)=>html.window.sessionStorage[prefix+ownerId];
  @override
  void write(String ownerId,String serialized){
    html.window.sessionStorage[prefix+ownerId]=serialized;
  }
  @override
  void clear(String ownerId){
    html.window.sessionStorage.remove(prefix+ownerId);
  }
}

PendingKeyStore createPendingKeyStore()=>SessionPendingKeyStore();
