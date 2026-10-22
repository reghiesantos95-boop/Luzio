const sharp=require('sharp');
const MAX_INPUT_PIXELS=120000000;
async function compressImage(bytes){
 try {
  return await sharp(bytes,{limitInputPixels:MAX_INPUT_PIXELS,animated:false,sequentialRead:true}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();
 } catch(error) {
  if(/pixel limit|exceeds.*pixels/i.test(error.message))throw Object.assign(new Error('Photo exceeds 120 megapixels. Resize its width and height before uploading.'),{code:'IMAGE_TOO_LARGE'});
  throw Object.assign(new Error('This photo could not be decoded. Export it again as PNG, JPEG, or WebP and retry.'),{code:'IMAGE_DECODE_FAILED'});
 }
}
module.exports={compressImage,MAX_INPUT_PIXELS};
