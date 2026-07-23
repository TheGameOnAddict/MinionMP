/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                minion: {
                    DEFAULT: '#F5E050', // Minion Yellow
                    400: '#FAE96F',
                    500: '#F5E050',
                    600: '#D4BE2A',
                    700: '#A69214',
                }
            }
        },
    },
    plugins: [],
}
