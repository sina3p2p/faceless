import axios from "axios";
import { APP } from "./constants";

const instance = axios.create({
    baseURL: `${APP.url}/api`,
    headers: {
        "Content-Type": "application/json",
    },
});

export default instance;