# ADR-010: Radio = async PTT voice, AI first responder

**Date:** 2026-07-12 · **Status:** Accepted

## Decision
Hold-to-talk voice messages (expo-av → Whisper → Claude parse), NOT live
WebRTC channels. AI answers status questions from DB instantly; drafts
requests for human approval; escalates when unsure. Every AI reply
carries visible AI badge. TTS: on-device (expo-speech) first; cloud TTS
(paid plans) later. Text always accompanies voice.

## Context
Zero-culture adoption: habit stays "tell the Gidas by voice", only the
word stops evaporating. Live PTT infra is a product in itself — rejected.
Phone calls remain allowed; system makes logging cheaper than not logging
(created_via='phone_logged').
