import { describe,it,expect } from "vitest";
import { parseJobWorkerConfig } from "../services/job-worker/config.js";
import { approvedServiceOrigin } from "../services/chat-api/archive_writer.js";

describe("private job worker configuration",()=>{
  it("stays off with no implicit resources",()=>{
    expect(parseJobWorkerConfig({})).toEqual({enabled:false,callers:[],owners:[],workflows:{}});
  });
  it("requires explicit approved owners, service callers and bounded handlers",()=>{
    expect(()=>parseJobWorkerConfig({AGENT_JOBS_ENABLED:"true"})).toThrow();
    expect(()=>parseJobWorkerConfig({AGENT_JOBS_ENABLED:"true",AGENT_JOBS_AUDIENCE:"https://worker-123.asia-east1.run.app",
      JOB_QUEUE_LIMITS_JSON:JSON.stringify({maxOwnerPending:2,maxGlobalPending:4,maxOwnerSchedules:2,maxGlobalSchedules:4}),
      AGENT_JOBS_ALLOWED_EMAILS:"worker@approved-project.iam.gserviceaccount.com",AGENT_JOBS_APPROVED_OWNER_IDS:"11111111-1111-4111-8111-111111111111"})).toThrow("without any configured handler");
  });
  it("rejects redirects, credentials, query fragments and arbitrary targets",()=>{
    for(const target of ["http://writer.run.app","https://example.org","https://user:password@writer-123.asia-east1.run.app","https://writer-123.asia-east1.run.app/path","https://writer-123.asia-east1.run.app/?secret=x"])
      expect(()=>approvedServiceOrigin(target)).toThrow();
  });
});
