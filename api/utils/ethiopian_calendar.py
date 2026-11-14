"""Ethiopian Calendar (Ge'ez calendar) conversion utilities.

Implements standard Julian Day Number (JDN) mapping between Gregorian
and Ethiopian Calendar systems.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import NamedTuple

ETHIOPIAN_MONTHS_AM = [
    "መስከረም", "ጥቅምት", "ህዳር", "ታኅሣሥ", "ጥር", "የካቲት",
    "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"
]

ETHIOPIAN_MONTHS_EN = [
    "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
    "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"
]


class EthiopianDate(NamedTuple):
    year: int
    month: int
    day: int

    def format_am(self) -> str:
        """Format as Amharic date string, e.g. 'ህዳር 5 ቀን 2019 ዓ.ም.'"""
        month_name = ETHIOPIAN_MONTHS_AM[self.month - 1]
        return f"{month_name} {self.day} ቀን {self.year} ዓ.ም."

    def format_en(self) -> str:
        """Format as English date string, e.g. 'Hidar 5, 2019 E.C.'"""
        month_name = ETHIOPIAN_MONTHS_EN[self.month - 1]
        return f"{month_name} {self.day}, {self.year} E.C."


def gregorian_to_ethiopian(g_date: date | datetime) -> EthiopianDate:
    """Convert a Gregorian date or datetime into an EthiopianDate."""
    year = g_date.year
    month = g_date.month
    day = g_date.day

    a = (14 - month) // 12
    y = year + 4800 - a
    m = month + 12 * a - 3
    jdn = day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045

    # Ethiopian epoch JDN: 1723856 (Aug 29, 8 CE)
    r = (jdn - 1723856) % 1461
    n = (r % 365) + 365 * (r // 1460)
    eth_year = 4 * ((jdn - 1723856) // 1461) + (r // 365) - (r // 1460)
    eth_month = (n // 30) + 1
    eth_day = (n % 30) + 1

    return EthiopianDate(eth_year, eth_month, eth_day)
