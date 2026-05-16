package com.qinglan.chatnovel.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val Plain = FontFamily.Default

/** Spec-faithful Material 3 type scale, system font (no webfont). */
val TBirdTypography = Typography(
    displayLarge = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 57.sp, lineHeight = 64.sp),
    displayMedium = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 45.sp, lineHeight = 52.sp),
    displaySmall = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 36.sp, lineHeight = 44.sp),
    headlineLarge = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 32.sp, lineHeight = 40.sp),
    headlineMedium = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 28.sp, lineHeight = 36.sp),
    headlineSmall = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 24.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W500, fontSize = 16.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W500, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W500, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W500, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W500, fontSize = 11.sp, lineHeight = 16.sp),
    bodyLarge = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = Plain, fontWeight = FontWeight.W400, fontSize = 12.sp, lineHeight = 16.sp),
)
