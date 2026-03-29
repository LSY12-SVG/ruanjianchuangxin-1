const isObject = value => typeof value === 'object' && value !== null;

const pick = (source, keys) => {
  const result = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
};

const sanitizeImageObject = value => {
  if (!isObject(value)) {
    return undefined;
  }
  const image = pick(value, ['mimeType', 'width', 'height', 'base64', 'fileName']);
  if (!Object.keys(image).length) {
    return undefined;
  }
  return image;
};

const TOOL_INPUT_SANITIZERS = {
  'navigation.navigate_tab': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['tab', 'route', 'mainTab', 'homeRoute']);
  },
  'app.summarize_current_page': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['pageSnapshot', 'contextHint']);
  },
  'grading.apply_visual_suggest': args => {
    if (!isObject(args)) {
      return {};
    }
    const image = sanitizeImageObject(args.image);
    const payload = pick(args, ['locale', 'currentParams', 'imageStats']);
    if (image) {
      payload.image = image;
    }
    return payload;
  },
  'convert.start_task': args => {
    if (!isObject(args)) {
      return {};
    }
    const image = sanitizeImageObject(args.image);
    return image ? {image} : {};
  },
  'community.create_draft': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['title', 'content', 'beforeUrl', 'afterUrl', 'tags', 'gradingParams']);
  },
  'community.publish_draft': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['draftId']);
  },
  'settings.apply_patch': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['syncOnWifi', 'communityNotify', 'voiceAutoApply']);
  },
  'permission.request': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['permission', 'permissions']);
  },
  'auth.require_login': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['contextHint', 'message']);
  },
  'file.pick': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['target', 'context', 'usage', 'tab', 'route']);
  },
  'file.write': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['url', 'downloadUrl', 'previewUrl', 'fileName', 'mimeType', 'target']);
  },
  'settings.open': args => {
    if (!isObject(args)) {
      return {};
    }
    return pick(args, ['target', 'screen']);
  },
};

const TOOL_OUTPUT_SANITIZERS = {
  'navigation.navigate_tab': output => (isObject(output) ? pick(output, ['targetTab']) : undefined),
  'app.summarize_current_page': output => (isObject(output) ? pick(output, ['summary']) : undefined),
  'grading.apply_visual_suggest': output =>
    isObject(output)
      ? pick(output, ['confidence', 'actionsCount', 'fallbackUsed', 'fallbackReason'])
      : undefined,
  'convert.start_task': output =>
    isObject(output)
      ? pick(output, [
          'taskId',
          'status',
          'pollAfterMs',
          'previewUrl',
          'downloadUrl',
          'viewerFiles',
          'previewImageUrl',
          'savedArtifact',
        ])
      : undefined,
  'community.create_draft': output => (isObject(output) ? pick(output, ['draftId']) : undefined),
  'community.publish_draft': output => (isObject(output) ? pick(output, ['postId', 'draftId']) : undefined),
  'settings.apply_patch': output => (isObject(output) ? pick(output, ['settings']) : undefined),
  'permission.request': output =>
    isObject(output) ? pick(output, ['permissions', 'permission', 'message']) : undefined,
  'auth.require_login': output =>
    isObject(output) ? pick(output, ['resumeHint', 'message']) : undefined,
  'file.pick': output =>
    isObject(output) ? pick(output, ['target', 'nextRequiredContext', 'message']) : undefined,
  'file.write': output =>
    isObject(output)
      ? pick(output, ['savedUri', 'savedTo', 'fileName', 'message', 'target'])
      : undefined,
  'settings.open': output =>
    isObject(output) ? pick(output, ['target', 'screen', 'message']) : undefined,
};

const sanitizeToolInput = ({toolName, args}) => {
  const sanitizer = TOOL_INPUT_SANITIZERS[String(toolName || '')];
  if (typeof sanitizer !== 'function') {
    return isObject(args) ? {...args} : {};
  }
  const sanitized = sanitizer(args);
  return isObject(sanitized) ? sanitized : {};
};

const sanitizeToolOutput = ({toolName, output}) => {
  const sanitizer = TOOL_OUTPUT_SANITIZERS[String(toolName || '')];
  if (typeof sanitizer !== 'function') {
    return isObject(output) ? output : undefined;
  }
  const sanitized = sanitizer(output);
  if (!isObject(sanitized) || Object.keys(sanitized).length === 0) {
    return undefined;
  }
  return sanitized;
};

module.exports = {
  sanitizeToolInput,
  sanitizeToolOutput,
};

