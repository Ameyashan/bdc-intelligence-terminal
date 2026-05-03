export const GLOBAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body {
    font-family: 'Inter Tight', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow: hidden;
  }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: oklch(0.30 0.02 250); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: oklch(0.40 0.02 250); }

  @keyframes bdc-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.4; }
  }
  @keyframes bdc-slide-up {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes bdc-fadein {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  button { font-family: inherit; }
  select, input { font-family: inherit; }
  select:focus, input:focus { outline: none; border-color: oklch(0.78 0.13 230); }
  table { border-spacing: 0; }
`;
