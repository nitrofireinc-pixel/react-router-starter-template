import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ASSET_VIDEO_PATHS,
  chosenVideoSource,
  renderVideoInner,
  safeVideoSrc,
  videoFrameStyle,
  sniffVideoType,
  verifyRemoteVideo,
  videoPropsError
} from '../worker/src/studio-video.mjs';

const studio = readFileSync(new URL('../admin-studio.js', import.meta.url), 'utf8');

test('site studio add-elements panel can add a resizable video', () => {
  assert.match(studio, /\['video', '🎬', 'Video'/);
  assert.match(studio, /openVideoPicker/);
  assert.match(studio, /Upload a video/);
  assert.match(studio, /Asset folder/);
  assert.match(studio, /Video address/);
  assert.match(studio, /\$\{api\}\/video/);
  assert.match(studio, /Drag the blue corner to resize this video/);
  assert.match(studio, /function placeVideoGrid/);
  assert.match(studio, /function hoistFlowVideos/);
  const frame = videoFrameStyle({ w: 8, h: 6 });
  assert.match(frame, /width:66\.667%/);
  assert.match(frame, /height:320px/);
  assert.match(videoFrameStyle({ w: 8, h: 4 }, { includeWidth: false }), /^height:208px/);
});

test('exactly one video source is accepted', () => {
  assert.equal(chosenVideoSource({}).ok, false);
  assert.equal(chosenVideoSource({ fileName: 'band.mp4', url: 'https://cdn.example.com/a.mp4' }).ok, false);
  assert.deepEqual(chosenVideoSource({ fileName: 'band.mp4' }).kind, 'upload');
  assert.equal(chosenVideoSource({ asset: '/assets/efhs-gallery-collage.mp4' }).kind, 'asset');
  assert.equal(chosenVideoSource({ url: 'https://cdn.example.com/a.mp4' }).kind, 'url');
});

test('video addresses stay on public files', () => {
  assert.equal(safeVideoSrc('/assets/efhs-gallery-collage.mp4'), '/assets/efhs-gallery-collage.mp4');
  assert.equal(safeVideoSrc('/uploads/studio/home/abc-def.mp4'), '/uploads/studio/home/abc-def.mp4');
  assert.equal(safeVideoSrc('https://cdn.example.com/band.mp4'), 'https://cdn.example.com/band.mp4');
  assert.equal(safeVideoSrc('http://cdn.example.com/band.mp4'), '');
  assert.equal(safeVideoSrc('https://127.0.0.1/band.mp4'), '');
  assert.equal(safeVideoSrc('javascript:alert(1)'), '');
  assert.ok(ASSET_VIDEO_PATHS.includes('/assets/efhs-gallery-collage.mp4'));
});

test('a video file signature is recognized and an html page is not', async () => {
  const mp4 = new Uint8Array(16);
  mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], 0);
  assert.equal(sniffVideoType(mp4), 'video/mp4');
  const html = new TextEncoder().encode('<!doctype html><title>nope</title>');
  const page = await verifyRemoteVideo('https://cdn.example.com/watch', async () => new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html' }
  }));
  assert.equal(page.ok, false);
  const file = await verifyRemoteVideo('https://cdn.example.com/band.mp4', async () => new Response(mp4, {
    status: 206,
    headers: { 'content-type': 'application/octet-stream' }
  }));
  assert.equal(file.ok, true);
  assert.equal(file.mime, 'video/mp4');
});

test('empty videos can sit in a draft and a real file renders in the block', () => {
  assert.equal(videoPropsError('', { draft: true }), '');
  assert.match(videoPropsError('', { draft: false }), /needs a video/);
  assert.equal(videoPropsError('javascript:alert(1)'), 'video needs a safe file address');
  assert.match(renderVideoInner({ src: '' }, { annotate: true }), /Choose a video/);
  assert.equal(renderVideoInner({ src: '' }, { annotate: false }), '');
  const html = renderVideoInner({ src: '/assets/efhs-gallery-collage.mp4', title: 'Collage' });
  assert.match(html, /<video /);
  assert.match(html, /src="\/assets\/efhs-gallery-collage\.mp4"/);
  assert.match(html, /controls/);
});
