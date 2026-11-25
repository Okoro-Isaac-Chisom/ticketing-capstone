// Asks the server's /health route and shows the answer on the page.
const label = document.querySelector('#status');
try {
  const res = await fetch('/health');
  const data = await res.json();
  label.textContent = `Server status: ${data.status}`;
} catch {
  label.textContent = 'Could not reach the server.';
}
