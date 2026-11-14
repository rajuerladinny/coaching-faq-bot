import { useEffect, useState } from "react";
import Admin from "./Admin.jsx";
import ChatWidget from "./ChatWidget.jsx";

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

export default function App() {
  const hash = useHashRoute();
  const chatMatch = hash.match(/^#\/chat\/(\d+)$/);
  if (chatMatch) return <ChatWidget centreId={Number(chatMatch[1])} />;
  return <Admin />;
}
