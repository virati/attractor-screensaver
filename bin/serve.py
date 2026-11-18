#!/usr/bin/env python3
"""Tiny static file server for the screensaver.

Prints `PORT=<n>` on stdout once bound, serves the project directory, and exits
when the page hits /__quit (which is how screensaver mode asks to be dismissed).

POST /__flag appends the JSON body as one line to the flag file (pressing `c`
on a system), and answers with that file's path and line count.
"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 0

DONE = threading.Event()

# Outside the repo, so flags survive a checkout and every instance (interactive,
# screensaver, each display) writes to the same place.
FLAGS = os.path.abspath(os.path.expanduser(os.environ.get('ATTRACTORS_FLAGS') or os.path.join(
    os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'),
    'attractors', 'flagged.jsonl')))
FLAGS_LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/__quit':
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.end_headers()
            DONE.set()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/__flag':
            self.send_error(404)
            return
        try:
            record = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            line = json.dumps(record, separators=(',', ':')) + '\n'
            with FLAGS_LOCK:
                os.makedirs(os.path.dirname(FLAGS), exist_ok=True)
                with open(FLAGS, 'a') as f:
                    f.write(line)
                with open(FLAGS) as f:
                    count = sum(1 for _ in f)
            body = json.dumps({'path': FLAGS, 'count': count}).encode()
            self.send_response(200)
        except Exception as e:  # bad body or unwritable file: say so to the page
            body = json.dumps({'error': str(e), 'path': FLAGS}).encode()
            self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    handler = functools.partial(Handler, directory=ROOT)
    with Server(('127.0.0.1', PORT), handler) as httpd:
        print('PORT=%d' % httpd.server_address[1], flush=True)
        threading.Thread(target=httpd.serve_forever, kwargs={'poll_interval': 0.2},
                         daemon=True).start()
        try:
            DONE.wait()
        except KeyboardInterrupt:
            pass
        httpd.shutdown()


if __name__ == '__main__':
    main()
