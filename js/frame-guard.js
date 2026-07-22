(() => {
  if (window.self === window.top) {
    document.getElementById('antiClickjack')?.remove();
    return;
  }

  try {
    window.top.location = window.self.location.href;
  } catch {
    // A sandboxed hostile frame cannot navigate the top page; the document stays hidden.
  }
})();
