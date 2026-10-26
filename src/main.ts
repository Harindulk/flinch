import "./styles.css";
import "./landing.css";
import { mount, show } from "./nav";
import { homeScreen } from "./screens/home";
import { reviewScreen } from "./screens/review";
import { getSession } from "./store";

mount(document.getElementById("app")!);

// A refresh on Review reopens the same playtest.
const id = location.hash.match(/^#\/review\/(.+)$/)?.[1];
const saved = id ? await getSession(decodeURIComponent(id)).catch(() => null) : null;
if (saved) show(reviewScreen(saved.session, saved.videos), location.hash);
else show(homeScreen());
