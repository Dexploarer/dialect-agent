#!/usr/bin/env node

// Simple script to test frontend and backend connectivity

console.log('Testing Frontend and Backend...\n');

// Test Frontend
fetch('http://localhost:3001')
  .then(res => {
    console.log(`✅ Frontend Status: ${res.status} ${res.statusText}`);
    console.log('   URL: http://localhost:3001');
    return res.text();
  })
  .then(html => {
    if (html.includes('AI Agent Dashboard')) {
      console.log('   Content: HTML contains expected title');
    } else {
      console.log('   ⚠️  Warning: HTML might not be loading correctly');
    }
  })
  .catch(err => {
    console.log('❌ Frontend Error:', err.message);
    console.log('   Make sure to run: cd frontend && bun run dev');
  });

// Test Backend
fetch('http://localhost:3000/health')
  .then(res => {
    console.log(`\n✅ Backend Status: ${res.status} ${res.statusText}`);
    console.log('   URL: http://localhost:3000');
    return res.json();
  })
  .then(data => {
    console.log('   Health:', JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.log('\n❌ Backend Error:', err.message);
    console.log('   Make sure to run: bun run dev:backend');
  });

// Test API proxy
setTimeout(() => {
  fetch('http://localhost:3001/api/stats')
    .then(res => {
      console.log(`\n✅ API Proxy Status: ${res.status} ${res.statusText}`);
      return res.json();
    })
    .then(data => {
      console.log('   Stats:', JSON.stringify(data, null, 2));
    })
    .catch(err => {
      console.log('\n❌ API Proxy Error:', err.message);
      console.log('   The frontend proxy might not be working correctly');
    });
}, 1000);

console.log('\n🌐 Open your browser to: http://localhost:3001');
console.log('📝 Check the browser console for any JavaScript errors\n');