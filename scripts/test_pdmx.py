"""Converter tests: python3 -m unittest discover scripts"""
import unittest

import pdmx


def note(step, octave, duration, voice='1', staff='1', ties=(), chord=False, alter=0):
    tie = ''.join(f'<tie type="{t}"/>' for t in ties)
    tied = ''.join(f'<tied type="{t}"/>' for t in ties)
    return (f'<note>{"<chord/>" if chord else ""}<pitch><step>{step}</step>{f"<alter>{alter}</alter>" if alter else ""}'
            f'<octave>{octave}</octave></pitch><duration>{duration}</duration>{tie}<voice>{voice}</voice>'
            f'<staff>{staff}</staff>{f"<notations>{tied}</notations>" if tied else ""}</note>')


def rest(duration, voice='1', staff='1'):
    return f'<note><rest/><duration>{duration}</duration><voice>{voice}</voice><staff>{staff}</staff></note>'


def score(*measures):
    attributes = '<attributes><divisions>2</divisions><staves>2</staves></attributes>'
    body = ''.join(f'<measure number="{i + 1}">{attributes if i == 0 else ""}{"".join(m)}</measure>' for i, m in enumerate(measures))
    return f'<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">{body}</part></score-partwise>'.encode()


def notes(xml):
    _, measures = pdmx.parse_score(xml)
    return [[(n['start'], n['duration'], n['midi'], n['hand'], bool(n.get('tied'))) for n in m['notes']] for m in measures]


class Ties(unittest.TestCase):
    def test_tie_into_another_voice_written_stop_first(self):
        # Voice 1 writes the tie stop before voice 2 writes its start (Clair de Lune, bar 1).
        xml = score([rest(2), note('F', 5, 4, ties=['stop']), '<backup><duration>6</duration></backup>',
                     rest(1, voice='2'), note('F', 5, 1, voice='2', ties=['start']), rest(4, voice='2')])
        self.assertEqual(notes(xml), [[(1, 5, 77, 'right', False)]])

    def test_shared_notehead_in_two_voices_is_one_held_note(self):
        # Lower staff: a held F in voice 5 and the same F as a short note in voice 6.
        xml = score([note('F', 4, 2, voice='5', staff='2', ties=['start']), note('F', 4, 4, voice='5', staff='2', ties=['stop']),
                     '<backup><duration>6</duration></backup>', note('F', 4, 1, voice='6', staff='2'), rest(5, voice='6', staff='2')])
        self.assertEqual(notes(xml), [[(0, 6, 65, 'left', False)]])

    def test_tie_over_the_barline_continues(self):
        xml = score([rest(4), note('A', 4, 2, ties=['start'])], [note('A', 4, 2, ties=['stop']), note('A', 4, 4)])
        self.assertEqual(notes(xml), [[(4, 2, 69, 'right', False)], [(0, 2, 69, 'right', True), (2, 4, 69, 'right', False)]])

    def test_chained_ties_in_one_measure(self):
        xml = score([note('C', 4, 2, ties=['start']), note('C', 4, 2, ties=['stop', 'start']), note('C', 4, 2, ties=['stop'])])
        self.assertEqual(notes(xml), [[(0, 6, 60, 'right', False)]])

    def test_a_stop_without_a_start_still_sounds(self):
        xml = score([note('C', 4, 3), note('C', 4, 3)], [note('F', 4, 6, ties=['stop'])])
        self.assertEqual(notes(xml)[1], [(0, 6, 65, 'right', False)])

    def test_a_start_with_no_written_stop_still_holds(self):
        xml = score([note('D', 4, 3, ties=['start']), note('D', 4, 3)])
        self.assertEqual(notes(xml), [[(0, 6, 62, 'right', False)]])


if __name__ == '__main__':
    unittest.main()
