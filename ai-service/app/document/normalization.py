def normalize_bbox(
    pixel_left: float,
    pixel_top: float,
    pixel_right: float,
    pixel_bottom: float,
    source_width: int,
    source_height: int,
) -> tuple[float, float, float, float]:
    """Convert pixel bbox to [x, y, width, height] normalized [0,1]."""
    if source_width <= 0 or source_height <= 0:
        raise ValueError("source_width and source_height must be positive")

    x = max(0.0, min(1.0, pixel_left / source_width))
    y = max(0.0, min(1.0, pixel_top / source_height))
    w = max(0.0, min(1.0, (pixel_right - pixel_left) / source_width))
    h = max(0.0, min(1.0, (pixel_bottom - pixel_top) / source_height))
    return (x, y, w, h)


def denormalize_bbox(
    x: float,
    y: float,
    width: float,
    height: float,
    source_width: int,
    source_height: int,
) -> tuple[int, int, int, int]:
    """Convert normalized [x, y, width, height] back to pixel bbox."""
    if source_width <= 0 or source_height <= 0:
        raise ValueError("source_width and source_height must be positive")

    left = int(round(x * source_width))
    top = int(round(y * source_height))
    right = int(round((x + width) * source_width))
    bottom = int(round((y + height) * source_height))
    return (left, top, right, bottom)
