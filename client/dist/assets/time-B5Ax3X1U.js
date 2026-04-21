function o(r){if(!r||r==="00:00")return r;const[n,t]=r.split(":").map(Number),h=n<12?"AM":"PM";return`${n%12||12}:${String(t).padStart(2,"0")} ${h}`}export{o as h};
