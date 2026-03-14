package com.visiongenieapp.colorengine

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager

data class EngineCapabilitySnapshot(
  val supportsNativePro: Boolean,
  val recommendedPreviewScale: Double,
  val recommendedExportFormat: String,
  val maxPreviewDimension: Int,
  val fallbackReason: String?,
  val workingSpace: String,
)

object EngineCapability {
  private fun resolveMemoryTier(context: Context): String {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val memoryClass = manager?.memoryClass ?: 0
    return when {
      memoryClass >= 384 -> "high"
      memoryClass >= 192 -> "mid"
      else -> "low"
    }
  }

  private fun resolveThermalRestricted(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return false
    }

    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val status = powerManager?.currentThermalStatus ?: return false
    return status >= PowerManager.THERMAL_STATUS_SEVERE
  }

  fun snapshot(context: Context): EngineCapabilitySnapshot {
    val memoryTier = resolveMemoryTier(context)
    val isThermalRestricted = resolveThermalRestricted(context)
    val model = Build.MODEL?.lowercase() ?: ""
    val isHighEndModel =
      model.contains("snapdragon 8") ||
        model.contains("adreno 7") ||
        model.contains("dimensity 9") ||
        model.contains("tab s")

    val supportsNativePro = !isThermalRestricted && (memoryTier != "low" || isHighEndModel)
    val recommendedPreviewScale =
      when {
        supportsNativePro && memoryTier == "high" -> 1.0
        supportsNativePro -> 0.82
        else -> 0.66
      }

    val maxPreviewDimension =
      when {
        supportsNativePro && memoryTier == "high" -> 4096
        supportsNativePro -> 3072
        else -> 2048
      }

    val recommendedExportFormat = if (supportsNativePro) "png16" else "jpeg"
    val fallbackReason =
      when {
        supportsNativePro -> null
        isThermalRestricted -> "thermal_restricted"
        memoryTier == "low" -> "memory_tier_low"
        else -> "device_not_qualified"
      }

    val workingSpace = if (supportsNativePro) "linear_prophoto" else "linear_srgb"

    return EngineCapabilitySnapshot(
      supportsNativePro = supportsNativePro,
      recommendedPreviewScale = recommendedPreviewScale,
      recommendedExportFormat = recommendedExportFormat,
      maxPreviewDimension = maxPreviewDimension,
      fallbackReason = fallbackReason,
      workingSpace = workingSpace,
    )
  }
}
