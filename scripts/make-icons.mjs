import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('frontend/public/icons', { recursive: true })

// Sage green background + white lightning bolt (matches OnboardingScreen logo)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#5a9e8a" rx="80"/>
  <path d="M288 80L160 288h112l-32 144 160-208H288L320 80z" fill="white"/>
</svg>`

const buf = Buffer.from(svg)
await sharp(buf).resize(192, 192).png().toFile('frontend/public/icons/icon-192.png')
await sharp(buf).resize(512, 512).png().toFile('frontend/public/icons/icon-512.png')
console.log('✓ Icons generated: icon-192.png, icon-512.png')
