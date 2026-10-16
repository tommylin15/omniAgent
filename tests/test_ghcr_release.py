import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import ghcr_release as release


def inputs():
    manifest={'source_sha':'a'*40,'services':{}}
    for service in release.SERVICES:
        manifest['services'][service]={
            'primary':{'revision':service+'-new','digest':'sha256:'+'b'*64,'sha':'a'*40},
            'fallback':{'revision':service+'-old','digest':'sha256:'+'c'*64,'sha':'d'*40}}
    acceptance={'source_sha':'a'*40,'services':{s:v['primary'] for s,v in manifest['services'].items()},
        'gates':{g:{'status':'PASS','run_url':'https://github.com/tommylin15/omniAgent/actions/runs/123'} for g in release.GATES}}
    return manifest,acceptance


def document(service,revision='old'):
    return {'spec':{'template':{'fixed':True}},'status':{'url':'https://owned.example',
        'traffic':[{'revisionName':service+'-'+revision,'percent':100},
                   {'revisionName':service+'-new','tag':'ghcr-'+'a'*12,'url':'https://new.example'},
                   {'revisionName':service+'-old','tag':'ghcr-'+'d'*12,'url':'https://old.example'}]}}


class ReleaseTests(unittest.TestCase):
    def test_missing_gate_and_wrong_digest_fail_before_mutation(self):
        manifest,acceptance=inputs()
        acceptance['gates']['browser_a_b_a']['status']='NOT_VERIFIED'
        with patch.object(release,'allocate') as allocate:
            self.assertEqual(release.run(manifest,acceptance)['validation'],'FAIL')
            allocate.assert_not_called()
        manifest,acceptance=inputs()
        acceptance=copy.deepcopy(acceptance)
        acceptance['services'][release.SERVICES[0]]['digest']='sha256:'+'e'*64
        with self.assertRaisesRegex(ValueError,'revision_mismatch'):
            release.validate(manifest,acceptance)

    def test_stale_source_never_mutates(self):
        with patch.object(release,'check_source',side_effect=RuntimeError('stale')),patch.object(release,'allocate') as allocate:
            self.assertEqual(release.run(*inputs())['recovery'],'NOT_NEEDED')
            allocate.assert_not_called()

    def test_split_traffic_rejected(self):
        service=release.SERVICES[0];row=document(service)
        row['status']['traffic'][0]['percent']=50
        with patch.object(release,'check_source'),patch.object(release,'snapshot',return_value=row),patch.object(release,'allocate') as allocate:
            self.assertEqual(release.run(*inputs())['validation'],'FAIL')
            allocate.assert_not_called()

    def test_failed_restoration_is_never_pass(self):
        service=release.SERVICES[0]
        with patch.object(release,'check_source'),patch.object(release,'snapshot',side_effect=lambda s:document(s)),patch.object(release,'check_version',return_value='https://tag.example'),patch.object(release,'probe'),patch.object(release,'allocate',side_effect=RuntimeError('failed')):
            result=release.run(*inputs())
            self.assertEqual(result['validation'],'FAIL')
            self.assertEqual(result['recovery'],'FAIL')

    def test_immutable_revision_mismatch_is_rejected(self):
        service=release.SERVICES[0];version=inputs()[0]['services'][service]['primary']
        row={'spec':{'containers':[{'image':'ghcr.io/tommylin15/'+service+'@'+version['digest']}]},
             'status':{'imageDigest':'ghcr.io/tommylin15/'+service+'@sha256:'+'e'*64,'conditions':[{'type':'Ready','status':'True'}]}}
        with patch.object(release,'cloud',return_value=__import__('json').dumps(row)):
            with self.assertRaisesRegex(RuntimeError,'digest'):
                release.check_version(service,version,document(service))

    def run_case(self,fail=False,drift=False):
        state={s:document(s) for s in release.SERVICES}
        updates=[]
        def snapshot(service):return copy.deepcopy(state[service])
        def allocate(service,revision):
            updates.append((service,revision))
            state[service]['status']['traffic'][0]['revisionName']=revision
            if fail and revision.endswith('-new') and len(updates)==1:
                if drift:state[service]['status']['traffic'][0]['revisionName']=service+'-other'
                raise RuntimeError('command_failed_after_update')
        with patch.object(release,'check_source'),patch.object(release,'check_version',return_value='https://tag.example'),patch.object(release,'probe'),patch.object(release,'snapshot',side_effect=snapshot),patch.object(release,'allocate',side_effect=allocate):
            result=release.run(*inputs())
        return result,state,updates

    def test_rehearses_fallback_then_finishes_primary(self):
        result,state,updates=self.run_case()
        self.assertEqual(result['validation'],'PASS')
        self.assertEqual(len(updates),9)
        for service in release.SERVICES:
            self.assertEqual(release.active(state[service]),{service+'-new':100})

    def test_failed_command_with_real_mutation_recovers_all_attempted_services(self):
        result,state,updates=self.run_case(fail=True)
        self.assertEqual(result['validation'],'FAIL')
        self.assertEqual(result['recovery'],'PASS')
        for service in release.SERVICES:
            self.assertEqual(release.active(state[service]),{service+'-old':100})

    def test_concurrent_traffic_is_not_overwritten(self):
        result,state,updates=self.run_case(fail=True,drift=True)
        self.assertEqual(result['recovery'],'BLOCKED')
        first=release.SERVICES[0]
        self.assertEqual(release.active(state[first]),{first+'-other':100})
        self.assertEqual(len([s for s,r in updates if s==first]),1)


if __name__=='__main__':unittest.main()
