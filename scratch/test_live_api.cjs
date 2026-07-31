const http = require('http');

function testLiveEndpoint(port) {
  const url = `http://127.0.0.1:${port}/api/photos/monthly-summary?siteName=${encodeURIComponent('천등산휴게소(평택방향)')}&year=2026&month=7`;
  console.log(`[TestLiveAPI IPv4] Querying ${url}...`);

  http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      console.log(`[TestLiveAPI Port ${port}] Status Code:`, res.statusCode);
      console.log(`[TestLiveAPI Port ${port}] Response:`, data);
    });
  }).on('error', (err) => {
    console.log(`[TestLiveAPI Port ${port}] Error:`, err.message);
  });
}

// Test ports 26241 ~ 26245
for (let p = 26241; p <= 26245; p++) {
  testLiveEndpoint(p);
}
