
const { getPublicImageUrl } = require('./utils/imageUtils');

// Mock browser globals if needed, but getPublicImageUrl seems pure string manipulation
// Actually it is pure.

const testUrls = [
    "https://drive.google.com/file/d/1ABC_123-Def4567890/view?usp=sharing",
    "https://docs.google.com/uc?id=1ABC_123-Def4567890",
    "https://drive.google.com/open?id=1ABC_123-Def4567890",
    "/local/image.png",
    "https://example.com/image.jpg",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
];

testUrls.forEach(url => {
    console.log(`Original: ${url}`);
    console.log(`Public:   ${getPublicImageUrl(url)}`);
    console.log('---');
});
