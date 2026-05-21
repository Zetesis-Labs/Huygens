"""Huygens autonomous worker.

Watches raw_capture via CHANGEFEED and, eventually, drives the clarify
loop via Agno + an LLM. Iteration 0: subscribe + log + emit raw_claimed.
"""

__version__ = "0.2.0"
