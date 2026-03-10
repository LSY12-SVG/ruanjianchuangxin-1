const CAPTURE_ANGLE_SEQUENCE = [
  'front',
  'front_right',
  'right',
  'back_right',
  'back',
  'back_left',
  'left',
  'front_left',
  'front_upper_right',
  'back_upper_right',
  'back_upper_left',
  'front_upper_left',
  'top_front',
  'top_back',
];

const TARGET_FRAME_COUNT = CAPTURE_ANGLE_SEQUENCE.length;
const MINIMUM_FRAME_COUNT = 8;

function getMissingAngleTags(frames) {
  const acceptedAngles = new Set(
    (frames || []).filter(frame => frame.accepted).map(frame => frame.angleTag),
  );

  return CAPTURE_ANGLE_SEQUENCE.filter(angleTag => !acceptedAngles.has(angleTag));
}

function getSuggestedAngleTag(frames) {
  return getMissingAngleTags(frames)[0] || null;
}

module.exports = {
  CAPTURE_ANGLE_SEQUENCE,
  TARGET_FRAME_COUNT,
  MINIMUM_FRAME_COUNT,
  getMissingAngleTags,
  getSuggestedAngleTag,
};
