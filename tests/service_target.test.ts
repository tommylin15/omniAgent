import {describe,it,expect} from "vitest";
import {serviceTargetMatches} from "../services/agent-gateway/service_target.js";
describe("private zero-traffic candidate audience binding",()=>{
  const audience="https://worker-123.asia-east1.run.app";
  it("permits only the canonical service or its own tagged hostname",()=>{
    expect(serviceTargetMatches(audience,audience)).toBe(true);
    expect(serviceTargetMatches("https://candidate---worker-123.asia-east1.run.app",audience)).toBe(true);
    for(const target of ["https://other-123.asia-east1.run.app","https://worker-123.asia-east1.run.app.evil.test",
      "https://evil.test/?target=worker-123.asia-east1.run.app","http://worker-123.asia-east1.run.app",
      "https://user:password@worker-123.asia-east1.run.app"])
      expect(serviceTargetMatches(target,audience)).toBe(false);
  });
});
