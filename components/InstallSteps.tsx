const steps = [
  "Tap Install EchoVest on this page.",
  "Confirm Add to Home screen in your browser.",
  "Open EchoVest from its new home screen icon.",
];

export function InstallSteps() {
  return <section className="section" style={{ paddingTop: 0 }}><div className="container surface" style={{ padding: 28 }}><div className="eyebrow">Install the app</div><h2 style={{ fontSize: 32, margin: "10px 0 28px" }}>Take EchoVest with you.</h2><div className="install-grid">{steps.map((step, index) => <div key={step} style={{ display: "flex", gap: 14 }}><strong style={{ color: "#F0B90B", fontSize: 24 }}>0{index + 1}</strong><p style={{ margin: 0, lineHeight: 1.5 }}>{step}</p></div>)}</div><p className="muted" style={{ fontSize: 13, margin: "26px 0 0" }}>On iPhone or iPad, tap Share in Safari, then choose Add to Home Screen.</p></div></section>;
}
