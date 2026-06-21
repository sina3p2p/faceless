import axios from "axios";

const instance = axios.create({
    baseURL: typeof window !== "undefined" ? "/api" : `${process.env.NEXT_PUBLIC_APP_URL}/api`,
    headers: {
        "Content-Type": "application/json",
    },
});

export default instance;