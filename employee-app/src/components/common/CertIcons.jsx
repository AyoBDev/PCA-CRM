// Minimal icon set ported from client/src/components/common/Icons.jsx —
// just the icons the admin "pa-service-card" certification portfolio design
// uses. Keep paths byte-identical to the admin source so the look matches.
const CertIcons = {
    heart: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35 3.42 12.8A5.5 5.5 0 0 1 7.5 3c1.74 0 3 .5 4.5 2 1.5-1.5 2.76-2 4.5-2a5.5 5.5 0 0 1 4.08 9.8L12 21.35Z" />
        </svg>
    ),
    clock: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5a1 1 0 0 0 .45.83l3 2a1 1 0 1 0 1.1-1.66L13 11.46V7Z" />
        </svg>
    ),
    users: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.31 0-7 1.67-7 5v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1c0-3.33-3.69-5-7-5Zm7.5-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0-2.6 1.16 6 6 0 0 1 0 4.68A3.5 3.5 0 0 0 16.5 11Zm.5 2c-.5 0-1.06.05-1.62.16C16.79 14.4 17.5 16 17.5 18v2H21a1 1 0 0 0 1-1v-1c0-3.33-3.19-5-5-5Z" />
        </svg>
    ),
    shieldCheck: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M11.24 2.28C13 3.8 15.5 5 17.5 5H19a2 2 0 0 1 2 2v6c0 5.5-3.86 8.31-8.34 9.9a2 2 0 0 1-1.32 0C6.86 21.31 3 18.5 3 13V7a2 2 0 0 1 2-2h1.5c2 0 4.5-1.2 6.26-2.72a1 1 0 0 0-.02-.02 1.17 1.17 0 0 0-1.5.02Zm5.47 6.51a1 1 0 0 0-1.42-1.4L10.5 12l-1.79-1.79a1 1 0 1 0-1.42 1.42l2.5 2.5a1 1 0 0 0 1.42 0l5-5.34Z" />
        </svg>
    ),
    user: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
    ),
    fileText: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8h-5a1 1 0 0 1-1-1V2H6Zm9 .59L19.41 7H15V2.59ZM8 12h8a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Zm0 4h8a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Zm0-8h2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Z" />
        </svg>
    ),
    calendar: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M8 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 2 0v1ZM3 11v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H3Z" />
        </svg>
    ),
    paperclip: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.7 3.3a4 4 0 0 0-5.65 0l-8.57 8.57a6 6 0 0 0 8.49 8.49l9.19-9.19a1 1 0 0 0-1.42-1.42l-9.19 9.2a4 4 0 0 1-5.66-5.66l8.58-8.57a2 2 0 0 1 2.83 2.83l-8.49 8.48a.5.5 0 0 1-.7-.7l7.77-7.78a1 1 0 0 0-1.42-1.42l-7.77 7.78a2.5 2.5 0 0 0 3.54 3.54l8.48-8.49a4 4 0 0 0 0-5.66Z" />
        </svg>
    ),
    upload: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.3 2.3a1 1 0 0 1 1.4 0l4 4a1 1 0 1 1-1.4 1.42L13 5.41V14a1 1 0 1 1-2 0V5.41L8.7 7.72a1 1 0 0 1-1.4-1.42l4-4ZM4 14a1 1 0 0 1 1 1v4h14v-4a1 1 0 1 1 2 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    chevronDown: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.3 8.3a1 1 0 0 1 1.4 0L12 13.58l5.3-5.3a1 1 0 0 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z" />
        </svg>
    ),
    chevronRight: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.3 5.3a1 1 0 0 0 0 1.4L13.58 12l-5.3 5.3a1 1 0 0 0 1.42 1.4l6-6a1 1 0 0 0 0-1.4l-6-6a1 1 0 0 0-1.42 0Z" />
        </svg>
    ),
    download: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1ZM4 14a1 1 0 0 1 1 1v4h14v-4a1 1 0 1 1 2 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    mail: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v.3l-10 6.25L2 6.8V6.5Zm0 2.66V17.5A2.5 2.5 0 0 0 4.5 20h15a2.5 2.5 0 0 0 2.5-2.5V9.16l-9.47 5.92a1 1 0 0 1-1.06 0L2 9.16Z" />
        </svg>
    ),
    checkCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.71a1 1 0 0 0-1.4-1.42l-4.8 4.8-1.8-1.8a1 1 0 1 0-1.4 1.42l2.5 2.5a1 1 0 0 0 1.4 0l5.5-5.5Z" />
        </svg>
    ),
    alertTriangle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M10.25 3.1a2 2 0 0 1 3.5 0l8 14A2 2 0 0 1 20 20H4a2 2 0 0 1-1.75-2.9l8-14ZM12 8a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 8.75a1.13 1.13 0 1 0 0 2.25 1.13 1.13 0 0 0 0-2.25Z" />
        </svg>
    ),
    bell: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a6 6 0 0 0-6 6c0 3.5-.86 5.5-1.6 6.6-.3.44-.55.8-.7 1.15A1 1 0 0 0 4.6 17h14.8a1 1 0 0 0 .9-1.25c-.15-.35-.4-.71-.7-1.15C18.86 13.5 18 11.5 18 8a6 6 0 0 0-6-6Zm-1.7 18.5a1.94 1.94 0 0 0 3.4 0 .75.75 0 0 0-.65-1.13h-2.1a.75.75 0 0 0-.65 1.13Z" />
        </svg>
    ),
};

export default CertIcons;
