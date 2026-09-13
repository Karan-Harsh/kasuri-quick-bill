/** Opens the KOT print view in a hidden iframe so the counter stays on the order screen. */
export function printKotInBackground(ticketId: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "KOT print";
  iframe.src = `/kot/${ticketId}?print=1`;
  Object.assign(iframe.style, {
    position: "fixed",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  iframe.onload = () => {
    window.setTimeout(() => iframe.remove(), 60_000);
  };

  document.body.appendChild(iframe);
}
