// Incremental parser for a multipart/x-mixed-replace MJPEG stream where every part carries Content-Length.
// push() takes bytes as they arrive from the network; onFrame receives each complete JPEG exactly once.
export function createMjpegParser(onFrame) {
  var buf = new Uint8Array(0);
  var MAX_HEADER = 65536;

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function headerEnd(b) { // index of the first \r\n\r\n, or -1
    for (var i = 0; i + 3 < b.length; i++) {
      if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i;
    }
    return -1;
  }

  return {
    push: function (chunk) {
      buf = concat(buf, chunk);
      for (;;) {
        var skip = 0; // CR/LF left over from the end of the previous part
        while (skip < buf.length && (buf[skip] === 13 || buf[skip] === 10)) skip++;
        if (skip) buf = buf.subarray(skip);

        var h = headerEnd(buf);
        if (h < 0) {
          if (buf.length > MAX_HEADER) buf = new Uint8Array(0); // garbage: resync on the next part
          return;
        }
        var head = new TextDecoder('ascii').decode(buf.subarray(0, h));
        var m = /content-length:\s*(\d+)/i.exec(head);
        var start = h + 4;
        if (!m) { buf = buf.subarray(start); continue; } // a part we cannot size: skip it, do not stall

        var len = +m[1];
        if (buf.length < start + len) return; // wait for the rest of this frame
        onFrame(buf.slice(start, start + len));
        buf = buf.subarray(start + len);
      }
    }
  };
}
