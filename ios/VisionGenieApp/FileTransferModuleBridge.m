#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FileTransferModule, NSObject)

RCT_EXTERN_METHOD(saveRemoteFile:(NSDictionary *)input
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
