import pytest
from app.document.normalization import normalize_bbox, denormalize_bbox


class TestNormalizeBBox:
    def test_basic(self):
        x, y, w, h = normalize_bbox(100, 200, 300, 250, 800, 600)
        assert x == pytest.approx(0.125)
        assert y == pytest.approx(200 / 600)
        assert w == pytest.approx(200 / 800)
        assert h == pytest.approx(50 / 600)

    def test_top_left_origin(self):
        x, y, w, h = normalize_bbox(0, 0, 800, 600, 800, 600)
        assert x == 0.0
        assert y == 0.0
        assert w == 1.0
        assert h == 1.0

    def test_clamps_out_of_bounds(self):
        x, y, w, h = normalize_bbox(-10, -5, 810, 610, 800, 600)
        assert x == 0.0
        assert y == 0.0
        assert w == pytest.approx(1.0)
        assert h == pytest.approx(1.0)

    def test_zero_size(self):
        with pytest.raises(ValueError):
            normalize_bbox(0, 0, 100, 100, 0, 0)

    def test_clips_right_and_bottom_edges(self):
        x, y, w, h = normalize_bbox(790, 590, 810, 620, 800, 600)
        assert x + w == pytest.approx(1.0)
        assert y + h == pytest.approx(1.0)


class TestDenormalizeBBox:
    def test_basic(self):
        left, top, right, bottom = denormalize_bbox(
            0.125, 200 / 600, 200 / 800, 50 / 600, 800, 600
        )
        assert left == 100
        assert top == 200
        assert right == 300
        assert bottom == 250

    def test_full_page(self):
        left, top, right, bottom = denormalize_bbox(0, 0, 1, 1, 800, 600)
        assert left == 0
        assert top == 0
        assert right == 800
        assert bottom == 600

    def test_zero_size(self):
        with pytest.raises(ValueError):
            denormalize_bbox(0, 0, 0.5, 0.5, 0, 0)


class TestRoundTrip:
    @pytest.mark.parametrize(
        "left,top,right,bottom,sw,sh",
        [
            (100, 200, 300, 250, 800, 600),
            (0, 0, 2480, 3508, 2480, 3508),
            (50, 100, 150, 120, 1000, 800),
        ],
    )
    def test_round_trip(self, left, top, right, bottom, sw, sh):
        x, y, w, h = normalize_bbox(left, top, right, bottom, sw, sh)
        l2, t2, r2, b2 = denormalize_bbox(x, y, w, h, sw, sh)
        assert l2 == left
        assert t2 == top
        assert r2 == right
        assert b2 == bottom
