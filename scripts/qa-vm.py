"""QMP/guest-agent controls for the isolated Lumius test VM. No physical disks."""
import argparse
import base64
import json
from pathlib import Path
import socket
import time

def connect(path, qmp=True):
    sock = socket.socket(socket.AF_UNIX)
    sock.settimeout(20)
    sock.connect(path)
    stream = sock.makefile('rwb', buffering=0)
    if qmp:
        json.loads(stream.readline())
        request(stream, 'qmp_capabilities')
    return sock, stream

def request(stream, command, arguments=None):
    data = (json.dumps({'execute': command, 'arguments': arguments or {}})+'\n').encode()
    while data:
        written = stream.write(data)
        if not written:
            raise RuntimeError('VM socket write failed')
        data = data[written:]
    while True:
        line = stream.readline()
        if not line:
            raise RuntimeError('VM connection closed')
        response = json.loads(line)
        if 'error' in response:
            raise RuntimeError(response['error'])
        if 'return' in response:
            return response['return']

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['screenshot','key','click','text','guest','upload','download','status'])
parser.add_argument('values', nargs='*')
args = parser.parse_args()
agent = args.action in ('guest','upload','download')
sock, stream = connect('/var/tmp/lumius-guest.sock' if agent else '/var/tmp/lumius-qmp.sock', not agent)
with sock, stream:
    if args.action == 'screenshot':
        from PIL import Image
        path = Path(args.values[0]).resolve()
        ppm = path.with_suffix('.ppm')
        request(stream, 'screendump', {'filename':str(ppm)})
        Image.open(ppm).save(path)
        ppm.unlink()
        print(path)
    elif args.action == 'status':
        print(request(stream, 'query-status'))
    elif args.action == 'key':
        request(stream, 'send-key', {'keys':[{'type':'qcode','data':k} for k in args.values[0].split('+')], 'hold-time':100})
    elif args.action == 'click':
        x,y,w,h = map(int,args.values)
        request(stream,'input-send-event',{'events':[{'type':'abs','data':{'axis':'x','value':round(x/w*32767)}},{'type':'abs','data':{'axis':'y','value':round(y/h*32767)}}]})
        for down in (True,False):
            request(stream,'input-send-event',{'events':[{'type':'btn','data':{'button':'left','down':down}}]})
            time.sleep(.1)
    elif args.action == 'text':
        mappings={' ':'spc','\n':'ret','/':'slash','.':'dot','-':'minus','_':'minus',':':'semicolon','=':'equal','@':'2'}
        for char in args.values[0]:
            key=mappings.get(char,char.lower())
            keys=([{'type':'qcode','data':'shift'}] if char.isupper() or char in '_:@' else [])+[{'type':'qcode','data':key}]
            request(stream,'send-key',{'keys':keys,'hold-time':35})
            time.sleep(.065)
    elif args.action == 'download':
        handle = request(stream,'guest-file-open',{'path':args.values[0],'mode':'rb'})
        try:
            with open(args.values[1],'wb') as destination:
                while True:
                    result=request(stream,'guest-file-read',{'handle':handle,'count':65536})
                    destination.write(base64.b64decode(result.get('buf-b64','')))
                    if result.get('eof') or not result.get('count'):
                        break
        finally:
            request(stream,'guest-file-close',{'handle':handle})
        print('Guest file downloaded')
    elif args.action == 'upload':
        handle = request(stream,'guest-file-open',{'path':args.values[1],'mode':'wb'})
        try:
            with open(args.values[0],'rb') as source:
                while chunk := source.read(65536):
                    result=request(stream,'guest-file-write',{'handle':handle,'buf-b64':base64.b64encode(chunk).decode()})
                    if result['count'] != len(chunk):
                        raise RuntimeError('Incomplete guest file write')
        finally:
            request(stream,'guest-file-close',{'handle':handle})
        print('File uploaded into isolated guest')
    else:
        pid=request(stream,'guest-exec',{'path':args.values[0],'arg':args.values[1:],'capture-output':True})['pid']
        for _ in range(120):
            result=request(stream,'guest-exec-status',{'pid':pid})
            if result.get('exited'):
                for key in ('out-data','err-data'):
                    if key in result:
                        print(base64.b64decode(result[key]).decode(errors='replace'))
                if result.get('exitcode',0):
                    raise SystemExit(result['exitcode'])
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Guest process still running after 60 seconds')
