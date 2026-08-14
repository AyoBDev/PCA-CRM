const Icons = {
    clipboard: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 2a1 1 0 0 0-1 1H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2a1 1 0 0 0-1-1H9Zm0 2h6v2H9V4Z" />
        </svg>
    ),
    layoutDashboard: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <rect width="8" height="10" x="3" y="3" rx="1.5" /><rect width="8" height="6" x="13" y="3" rx="1.5" /><rect width="8" height="10" x="13" y="11" rx="1.5" /><rect width="8" height="6" x="3" y="15" rx="1.5" />
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
    fileText: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8h-5a1 1 0 0 1-1-1V2H6Zm9 .59L19.41 7H15V2.59ZM8 12h8a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Zm0 4h8a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Zm0-8h2a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2Z" />
        </svg>
    ),
    settings: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M11.78 2h.44a2 2 0 0 1 2 2v.18c0 .35.19.68.5.85l.05.03c.31.18.69.18 1 0l.15-.08a2 2 0 0 1 2.73.73l.22.38a2 2 0 0 1-.73 2.73l-.15.09c-.31.17-.5.5-.5.86v.1c0 .36.19.69.5.86l.15.09a2 2 0 0 1 .73 2.73l-.22.38a2 2 0 0 1-2.73.73l-.15-.08c-.31-.18-.69-.18-1 0l-.05.03a1 1 0 0 0-.5.85V20a2 2 0 0 1-2 2h-.44a2 2 0 0 1-2-2v-.18a1 1 0 0 0-.5-.85l-.05-.03c-.31-.18-.69-.18-1 0l-.15.08a2 2 0 0 1-2.73-.73l-.22-.38a2 2 0 0 1 .73-2.73l.15-.09c.31-.17.5-.5.5-.86v-.1c0-.36-.19-.69-.5-.86l-.15-.09a2 2 0 0 1-.73-2.73l.22-.38a2 2 0 0 1 2.73-.73l.15.08c.31.18.69.18 1 0l.05-.03c.31-.17.5-.5.5-.85V4a2 2 0 0 1 2-2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </svg>
    ),
    helpCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15.25a1.13 1.13 0 1 1 0-2.25 1.13 1.13 0 0 1 0 2.25ZM12 6a3.75 3.75 0 0 0-3.67 3 1 1 0 0 0 1.96.4A1.75 1.75 0 1 1 12 11.25a1 1 0 0 0-1 1V13a1 1 0 1 0 2 0v-.13A3.75 3.75 0 0 0 12 6Z" />
        </svg>
    ),
    search: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M11 3a8 8 0 1 0 4.9 14.32l3.4 3.39a1 1 0 0 0 1.4-1.42l-3.39-3.4A8 8 0 0 0 11 3Zm-6 8a6 6 0 1 1 12 0 6 6 0 0 1-12 0Z" />
        </svg>
    ),
    plus: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 5a1 1 0 1 0-2 0v6H5a1 1 0 1 0 0 2h6v6a1 1 0 1 0 2 0v-6h6a1 1 0 1 0 0-2h-6V5Z" />
        </svg>
    ),
    download: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1ZM4 14a1 1 0 0 1 1 1v4h14v-4a1 1 0 1 1 2 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    printer: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 2a1 1 0 0 0-1 1v5h12V3a1 1 0 0 0-1-1H7Zm13 6H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2h1a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2Zm-3 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM7 15a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H7Zm2 3h6a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2Z" />
        </svg>
    ),
    edit: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.66 2.34a2.83 2.83 0 0 1 4 4l-1.06 1.06-4-4 1.06-1.06ZM15.18 4.82l4 4L9.4 18.6a2 2 0 0 1-.83.5l-4.35 1.32a.5.5 0 0 1-.62-.62l1.32-4.35a2 2 0 0 1 .5-.83l9.76-9.79Z" />
        </svg>
    ),
    trash: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 2a1 1 0 0 0-1 1v1H4a1 1 0 0 0 0 2h1v13a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V6h1a1 1 0 1 0 0-2h-5V3a1 1 0 0 0-1-1h-4Zm1 2h2v0h-2Zm-1 6a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    check: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.7 5.3a1 1 0 0 1 0 1.4l-11 11a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4L9 15.58l10.3-10.3a1 1 0 0 1 1.4 0Z" />
        </svg>
    ),
    checkCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.71a1 1 0 0 0-1.4-1.42l-4.8 4.8-1.8-1.8a1 1 0 1 0-1.4 1.42l2.5 2.5a1 1 0 0 0 1.4 0l5.5-5.5Z" />
        </svg>
    ),
    checkSquare: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm11.7 6.71a1 1 0 0 0-1.4-1.42l-4.3 4.3-1.3-1.3a1 1 0 0 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l5-5Z" />
        </svg>
    ),
    alertCircle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8.75a1.13 1.13 0 1 0 0 2.25 1.13 1.13 0 0 0 0-2.25Z" />
        </svg>
    ),
    trendingUp: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 6a1 1 0 0 0 0 2h3.59l-6.09 6.09-4.29-4.3a1 1 0 0 0-1.42 0l-6.5 6.5a1 1 0 1 0 1.42 1.42l5.79-5.8 4.29 4.3a1 1 0 0 0 1.42 0L21 9.41V13a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1h-6Z" />
        </svg>
    ),
    trendingDown: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 18a1 1 0 0 1 0-2h3.59l-6.09-6.09-4.29 4.3a1 1 0 0 1-1.42 0l-6.5-6.5a1 1 0 0 1 1.42-1.42l5.79 5.8 4.29-4.3a1 1 0 0 1 1.42 0L21 14.59V11a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1h-6Z" />
        </svg>
    ),
    chevronLeft: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.7 5.3a1 1 0 0 1 0 1.4L10.42 12l5.3 5.3a1 1 0 0 1-1.42 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.42 0Z" />
        </svg>
    ),
    chevronRight: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.3 5.3a1 1 0 0 0 0 1.4L13.58 12l-5.3 5.3a1 1 0 0 0 1.42 1.4l6-6a1 1 0 0 0 0-1.4l-6-6a1 1 0 0 0-1.42 0Z" />
        </svg>
    ),
    upload: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.3 2.3a1 1 0 0 1 1.4 0l4 4a1 1 0 1 1-1.4 1.42L13 5.41V14a1 1 0 1 1-2 0V5.41L8.7 7.72a1 1 0 0 1-1.4-1.42l4-4ZM4 14a1 1 0 0 1 1 1v4h14v-4a1 1 0 1 1 2 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    table: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm6 5V5h8v3h-8Zm-2 0H5V5h4v3Zm0 2v4H5v-4h4Zm2 0h8v4h-8v-4Zm0 6h8v3h-8v-3Zm-2 0v3H5v-3h4Z" />
        </svg>
    ),
    user: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
    ),
    logOut: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4a1 1 0 1 0 0-2H5V5h4a1 1 0 0 0 0-2H5Zm10.3 4.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4L17.58 13H10a1 1 0 1 1 0-2h7.59l-2.3-2.3a1 1 0 0 1 0-1.4Z" />
        </svg>
    ),
    share: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2a3 3 0 0 0-2.83 4l-5.4 3.15a3 3 0 1 0 0 5.7l5.4 3.15A3 3 0 1 0 16.1 16l-5.4-3.15a3.02 3.02 0 0 0 0-1.7L16.1 8A3 3 0 1 0 18 2Z" />
        </svg>
    ),
    copy: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h4Zm2 0h4a2 2 0 0 1 2 2v4h2V4h-8v4Z" />
        </svg>
    ),
    dollarSign: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a1 1 0 0 1 1 1v1h3a1 1 0 1 1 0 2H9.5a1.5 1.5 0 0 0 0 3h5a3.5 3.5 0 0 1 .5 6.96V20a1 1 0 1 1-2 0v-1H8a1 1 0 1 1 0-2h6.5a1.5 1.5 0 0 0 0-3h-5A3.5 3.5 0 0 1 9 7.04V4a1 1 0 0 1 1-1V2a1 1 0 0 1 1-1h1Z" />
        </svg>
    ),
    calendar: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M8 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 2 0v1ZM3 11v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H3Z" />
        </svg>
    ),
    clock: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5a1 1 0 0 0 .45.83l3 2a1 1 0 1 0 1.1-1.66L13 11.46V7Z" />
        </svg>
    ),
    alertTriangle: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M10.25 3.1a2 2 0 0 1 3.5 0l8 14A2 2 0 0 1 20 20H4a2 2 0 0 1-1.75-2.9l8-14ZM12 8a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 8.75a1.13 1.13 0 1 0 0 2.25 1.13 1.13 0 0 0 0-2.25Z" />
        </svg>
    ),
    archive: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4Zm1 6h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Zm6 2a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2h-4Z" />
        </svg>
    ),
    rotateCcw: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a9 9 0 1 1-8.48 6 1 1 0 0 1 1.88.67A7 7 0 1 0 6.7 5.7L8.7 7.7A1 1 0 0 1 8 9.41H3a1 1 0 0 1-1-1v-5A1 1 0 0 1 3.7 2.7l1.62 1.62A8.97 8.97 0 0 1 12 3Z" />
        </svg>
    ),
    key: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M15.5 2a6.5 6.5 0 0 0-6.28 8.2l-6.93 6.92a1 1 0 0 0-.29.71V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 1-1v-1h1a1 1 0 0 0 .7-.3l1.1-1.1A6.5 6.5 0 1 0 15.5 2ZM17 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
        </svg>
    ),
    eye: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        </svg>
    ),
    eyeOff: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.7 2.3a1 1 0 0 0-1.4 1.4l3.3 3.3C2.5 8.6 1.28 10.6.62 11.7a.6.6 0 0 0 0 .6C1.9 14.5 5.24 19 12 19c1.94 0 3.6-.37 5-.98l3.3 3.3a1 1 0 0 0 1.4-1.4l-19-19Zm7.3 10.13 1.57 1.57a2 2 0 0 1-1.57-1.57ZM12 5c-.9 0-1.72.08-2.46.22l2.13 2.12A4 4 0 0 1 16.66 12l2.79 2.79c1.3-1.24 2.14-2.6 2.55-3.3a.6.6 0 0 0 0-.6C20.73 8.87 17.85 5 12 5Z" />
        </svg>
    ),
    heart: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35 3.42 12.8A5.5 5.5 0 0 1 7.5 3c1.74 0 3 .5 4.5 2 1.5-1.5 2.76-2 4.5-2a5.5 5.5 0 0 1 4.08 9.8L12 21.35Z" />
        </svg>
    ),
    building: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4v-4h4v4h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6Zm2 4h1.5v1.5H8V6Zm4.75 0h1.5v1.5h-1.5V6ZM8 9.75h1.5v1.5H8v-1.5Zm4.75 0h1.5v1.5h-1.5v-1.5ZM8 13.5h1.5V15H8v-1.5Zm4.75 0h1.5V15h-1.5v-1.5Z" />
        </svg>
    ),
    alertOctagon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M7.86 2a1 1 0 0 0-.7.3L2.29 7.15a1 1 0 0 0-.29.71v8.28a1 1 0 0 0 .3.7l4.85 4.86a1 1 0 0 0 .71.29h8.28a1 1 0 0 0 .7-.3l4.86-4.85a1 1 0 0 0 .29-.71V7.86a1 1 0 0 0-.3-.7L17.56 2.3a1 1 0 0 0-.71-.29H7.86ZM12 7a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8.75a1.13 1.13 0 1 0 0 2.25 1.13 1.13 0 0 0 0-2.25Z" />
        </svg>
    ),
    folder: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4Z" />
        </svg>
    ),
    paperclip: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.7 3.3a4 4 0 0 0-5.65 0l-8.57 8.57a6 6 0 0 0 8.49 8.49l9.19-9.19a1 1 0 0 0-1.42-1.42l-9.19 9.2a4 4 0 0 1-5.66-5.66l8.58-8.57a2 2 0 0 1 2.83 2.83l-8.49 8.48a.5.5 0 0 1-.7-.7l7.77-7.78a1 1 0 0 0-1.42-1.42l-7.77 7.78a2.5 2.5 0 0 0 3.54 3.54l8.48-8.49a4 4 0 0 0 0-5.66Z" />
        </svg>
    ),
    chevronUp: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.3 15.7a1 1 0 0 0 1.4 0L12 10.42l5.3 5.3a1 1 0 0 0 1.4-1.42l-6-6a1 1 0 0 0-1.4 0l-6 6a1 1 0 0 0 0 1.4Z" />
        </svg>
    ),
    chevronDown: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.3 8.3a1 1 0 0 1 1.4 0L12 13.58l5.3-5.3a1 1 0 0 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z" />
        </svg>
    ),
    moreVertical: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        </svg>
    ),
    externalLink: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 3a1 1 0 0 0 0 2h3.59l-8.3 8.3a1 1 0 0 0 1.42 1.4L19 6.42V10a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-6ZM5 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a1 1 0 1 0-2 0v6H5V7h6a1 1 0 1 0 0-2H5Z" />
        </svg>
    ),
    phone: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2Z" />
        </svg>
    ),
    mail: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v.3l-10 6.25L2 6.8V6.5Zm0 2.66V17.5A2.5 2.5 0 0 0 4.5 20h15a2.5 2.5 0 0 0 2.5-2.5V9.16l-9.47 5.92a1 1 0 0 1-1.06 0L2 9.16Z" />
        </svg>
    ),
    undo: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 5.41 5.7 8.7A9 9 0 0 1 21 15a1 1 0 1 1-2 0 7 7 0 0 0-11.8-5.1L9.7 12.3A1 1 0 0 1 9 14H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1.7-.7L5.3 7.9 9 4.6V5.4Zm0 0Z" />
        </svg>
    ),
    arrowLeft: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.7 4.3a1 1 0 0 1 0 1.4L6.42 11H19a1 1 0 1 1 0 2H6.41l5.3 5.3a1 1 0 0 1-1.42 1.4l-7-7a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.42 0Z" />
        </svg>
    ),
    redo: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 5.41V4.6l3.7 3.3L20.3 6.3A1 1 0 0 1 22 7v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-.7-1.7l2.5-2.4A7 7 0 0 0 5 15a1 1 0 1 1-2 0A9 9 0 0 1 18.3 8.7L15 5.41Z" />
        </svg>
    ),
    history: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a9 9 0 0 0-6.74 3.06L3.7 4.3A1 1 0 0 0 2 5v5a1 1 0 0 0 1 1h5a1 1 0 0 0 .7-1.7L6.7 7.28A7 7 0 1 1 5 12a1 1 0 1 0-2 0 9 9 0 1 0 9-9Zm0 3a1 1 0 0 1 1 1v4.38l2.5 1.25a1 1 0 1 1-.9 1.79l-3-1.5A1 1 0 0 1 11 12V7a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    moreHorizontal: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        </svg>
    ),
    menu: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 6a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 5a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2H4Z" />
        </svg>
    ),
    filter: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 4a1 1 0 0 1 1-1h18a1 1 0 0 1 .78 1.62L15 12.85V19a1 1 0 0 1-.55.9l-4 2A1 1 0 0 1 9 21v-8.15L2.22 4.62A1 1 0 0 1 2 4Z" />
        </svg>
    ),
    bell: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a6 6 0 0 0-6 6c0 3.5-.86 5.5-1.6 6.6-.3.44-.55.8-.7 1.15A1 1 0 0 0 4.6 17h14.8a1 1 0 0 0 .9-1.25c-.15-.35-.4-.71-.7-1.15C18.86 13.5 18 11.5 18 8a6 6 0 0 0-6-6Zm-1.7 18.5a1.94 1.94 0 0 0 3.4 0 .75.75 0 0 0-.65-1.13h-2.1a.75.75 0 0 0-.65 1.13Z" />
        </svg>
    ),
    repeat: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.3 1.3a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 1-1.4-1.4L17.58 6H7a3 3 0 0 0-3 3v1a1 1 0 1 1-2 0V9a5 5 0 0 1 5-5h10.59l-1.3-1.3a1 1 0 0 1 0-1.4ZM21 13a1 1 0 0 1 1 1v1a5 5 0 0 1-5 5H6.41l1.3 1.3a1 1 0 0 1-1.42 1.4l-3-3a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.42 1.4L6.4 18H17a3 3 0 0 0 3-3v-1a1 1 0 0 1 1-1Z" />
        </svg>
    ),
    x: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.3 5.3a1 1 0 0 1 1.4 0L12 9.58l4.3-4.3a1 1 0 0 1 1.4 1.42L13.42 11l4.3 4.3a1 1 0 0 1-1.42 1.4L12 12.42l-4.3 4.3a1 1 0 0 1-1.4-1.42L10.58 11l-4.3-4.3a1 1 0 0 1 0-1.4Z" />
        </svg>
    ),
    cursor: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.24 2.12a1 1 0 0 0-1.32 1.2l4.5 16.5a1 1 0 0 0 1.86.17l2.9-5.8 5.8-2.9a1 1 0 0 0-.17-1.86L5.31 2.24a1 1 0 0 0-.24-.05 1 1 0 0 0-.83-.07Z" />
        </svg>
    ),
    pen: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3h7a1 1 0 1 1 0 2H5v14h14v-7a1 1 0 1 1 2 0v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm13.38-.38a2 2 0 0 1 3 3l-8.4 8.4a2 2 0 0 1-.85.5l-2.87.85a.5.5 0 0 1-.62-.62l.84-2.88a2 2 0 0 1 .5-.85l8.4-8.4Z" />
        </svg>
    ),
    highlight: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.3 3.3 8.5 8.1a2 2 0 0 0 0 2.8l4.6 4.6a2 2 0 0 0 2.8 0l4.8-4.8a1 1 0 0 0 0-1.42l-6-6a1 1 0 0 0-1.42 0Zm-4.9 8.4-5.1 5.1a1 1 0 0 0-.3.7v3a1 1 0 0 0 1 1h9a1 1 0 0 0 .7-.3l2.3-2.3-3.36-3.36a2 2 0 0 1-.42 0 3 3 0 0 1-2.12-.88L8.4 11.7Z" />
        </svg>
    ),
};

export default Icons;
