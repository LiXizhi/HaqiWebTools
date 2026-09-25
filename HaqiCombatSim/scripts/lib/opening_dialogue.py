"""Apply authored opening dialogue without changing quest mechanics."""
from copy import deepcopy


def apply_opening_dialogue(quests, config):
    if set(config['quests']) != {str(q['id']) for q in quests}:
        raise ValueError('Opening dialogue must cover exactly the chapter quests')
    adaptations = []
    for quest in quests:
        authored = config['quests'][str(quest['id'])]

        def lines(entries, npc_id, action):
            if not entries:
                raise ValueError('Dialogue cannot be empty')
            return [{'npcId': npc_id, 'text': entry['text'], 'buttons': [{
                'action': action if index == len(entries) - 1 else 'gotonext',
                'label': entry['reply'],
            }]} for index, entry in enumerate(entries)]

        def replace(target, key, value, section):
            original = deepcopy(target[key])
            target[key] = value
            adaptations.append({'questId': quest['id'], 'section': section,
                                 'original': original, 'replacement': deepcopy(value),
                                 'reason': 'compact-web-opening'})

        replace(quest, 'description', authored['description'], 'description')
        for section, npc_id, action in [('startDialog', quest['startNpc'], 'doaccept'),
                                         ('endDialog', quest['endNpc'], 'dofinished')]:
            replace(quest, section, lines(authored[section], npc_id, action), section)
        if set(authored['talks']) != {str(t['npcId']) for t in quest['talks']}:
            raise ValueError('Opening dialogue must preserve every talk target')
        for talk in quest['talks']:
            entry = authored['talks'][str(talk['npcId'])]
            replace(talk, 'label', entry['label'], f"talks/{talk['npcId']}/label")
            replace(talk, 'dialog', lines(entry['dialog'], talk['npcId'], 'donpcdialoged'),
                    f"talks/{talk['npcId']}/dialog")
    return adaptations
