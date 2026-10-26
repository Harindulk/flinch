import "./styles.css";
import "./landing.css";
import { mount, show } from "./nav";
import { homeScreen } from "./screens/home";
import { reviewScreen } from "./screens/review";
import { getSession } from "./store";

const app = document.getElementById("app")!;
mount(app);

// After a route change, move focus to the new screen's heading so screen readers announce it (not on first load, and not if the screen focused something itself).
let firstRender = true;
new MutationObserver(() => {
  if (firstRender) return void (firstRender = false);
  const heading = app.querySelector("h1");
  if (!heading || app.contains(document.activeElement)) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}).observe(app, { childList: true });

// A refresh on Review reopens the same playtest.
const id = location.hash.match(/^#\/review\/(.+)$/)?.[1];
const saved = id ? await getSession(decodeURIComponent(id)).catch(() => null) : null;
if (saved) show(reviewScreen(saved.session, saved.videos), location.hash);
else show(homeScreen());
