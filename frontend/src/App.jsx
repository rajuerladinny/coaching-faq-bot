import { useEffect, useState } from "react";
import Admin from "./Admin.jsx";
import ChatWidget from "./ChatWidget.jsx";
import { DEMO } from "./api.js";

// Routes: #/admin (owner) and #/chat/<centreId> (parents and students)
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/admin");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/admin");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function DemoBar({ onChat }) {
  return (
    <div className="demo-bar" role="status">
      <span>
        <strong>Demo.</strong> Sample centre, nothing is saved or sent.
      </span>
      <a href={onChat ? "#/admin" : "#/chat/1"}>
        {onChat ? "See the owner's page" : "Try the parent chat"}
      </a>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();
  const chatMatch = hash.match(/^#\/chat\/(\d+)$/);
  if (chatMatch) {
    return (
      <>
        {DEMO && <DemoBar onChat />}
        <ChatWidget centreId={Number(chatMatch[1])} />
      </>
    );
  }
  // The chat page may be embedded on a centre's website; the owner page never should be,
  // so a hostile page cannot overlay it and trick an owner into clicking.
  if (isFramed()) {
    return (
      <p className="page-error">
        Open the owner page in its own tab:{" "}
        <a href={window.location.href} target="_blank" rel="noreferrer">
          open
        </a>
      </p>
    );
  }
  return (
    <>
      {DEMO && <DemoBar />}
      <Admin />
    </>
  );
}
