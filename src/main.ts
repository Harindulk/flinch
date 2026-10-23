import "./styles.css";
import { mount, show } from "./nav";
import { homeScreen } from "./screens/home";

mount(document.getElementById("app")!);
show(homeScreen());
